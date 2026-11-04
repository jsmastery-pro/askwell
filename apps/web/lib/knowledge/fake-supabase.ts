// TEST-ONLY. A tiny in-memory stand-in for the Supabase Data API and Storage,
// enough for the knowledge routes: projects/accounts reads with RLS for
// owners, the knowledge tables, reserve_knowledge_source() and
// claim_knowledge_source() with the migration's rules, and the knowledge
// bucket. Callers are told apart by their Authorization header (an owner's
// Clerk token vs the secret key), like lib/projects/fake-postgrest.ts.
// Never import it from app code.
import type { KnowledgeSource, Plan } from "@askwell/shared";
import { SECRET_KEY } from "../projects/fake-postgrest";

export { PUBLISHABLE_KEY, SECRET_KEY, SUPABASE_URL, tokenFor } from "../projects/fake-postgrest";

type ProjectRow = { id: string; owner_id: string; name: string };
type ChunkRow = { id: string; project_id: string; source_id: string; content: string; embedding: string };
type Caller = { kind: "owner"; userId: string } | { kind: "service" } | { kind: "anon" };

export type RecordedRequest = { method: string; path: string; caller: Caller; body: unknown };

const RESERVATION_TTL_MS = 2 * 60 * 60 * 1000;

export function createFakeSupabase() {
  const accounts = new Map<string, Plan>();
  const projects: ProjectRow[] = [];
  const sources: KnowledgeSource[] = [];
  const chunks: ChunkRow[] = [];
  /** The knowledge bucket: storage key → bytes. */
  const files = new Map<string, Uint8Array>();
  const requests: RecordedRequest[] = [];
  let now = Date.parse("2026-11-04T12:00:00Z");
  let nextId = 1;
  const uuid = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const pgError = (status: number, code: string, message: string) =>
    json({ code, message, details: null, hint: null }, status);
  const noContent = () => new Response(null, { status: 204 });

  function callerOf(headers: Headers): Caller {
    const bearer = headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (bearer === SECRET_KEY || headers.get("apikey") === SECRET_KEY) return { kind: "service" };
    const match = /^clerk-token-for:(.+)$/.exec(bearer);
    return match?.[1] ? { kind: "owner", userId: match[1] } : { kind: "anon" };
  }

  /** The project ids `caller` may see: their own (RLS), or all for the service role. */
  function visibleProjectIds(caller: Caller): Set<string> {
    if (caller.kind === "service") return new Set(projects.map((p) => p.id));
    if (caller.kind === "owner") return new Set(projects.filter((p) => p.owner_id === caller.userId).map((p) => p.id));
    return new Set();
  }

  /** eq. filters from the query string. */
  function eqFilters(search: URLSearchParams): Record<string, string> {
    const filters: Record<string, string> = {};
    for (const [key, value] of search) if (value.startsWith("eq.")) filters[key] = value.slice(3);
    return filters;
  }
  const matches = (row: object, filters: Record<string, string>) =>
    Object.entries(filters).every(([column, value]) => String((row as Record<string, unknown>)[column]) === value);

  /** PostgREST answers an array, or one object when the client asked for vnd.pgrst.object. */
  function rows(headers: Headers, list: unknown[]): Response {
    if (!headers.get("accept")?.includes("vnd.pgrst.object")) return json(list);
    if (list.length !== 1) return pgError(406, "PGRST116", "JSON object requested, multiple (or no) rows returned");
    return json(list[0]);
  }

  function reserve(body: Record<string, unknown>): Response {
    const projectId = String(body.p_project_id);
    const max = body.p_max_sources as number;
    const type = String(body.p_type);
    const key = body.p_storage_key as string | null;
    const status = String(body.p_status);
    const textShape = type === "text" && key === null && status === "processing";
    const fileShape = type !== "text" && key !== null && status === "uploading";
    if (!textShape && !fileShape) return pgError(400, "22023", "invalid_source");
    if (!projects.some((p) => p.id === projectId)) return pgError(404, "P0002", "project_not_found");

    const reclaimed: string[] = [];
    for (let i = sources.length - 1; i >= 0; i--) {
      const s = sources[i] as KnowledgeSource;
      if (s.project_id === projectId && s.status === "uploading" && now - Date.parse(s.created_at) > RESERVATION_TTL_MS) {
        reclaimed.push(s.storage_key as string);
        sources.splice(i, 1);
      }
    }
    if (sources.filter((s) => s.project_id === projectId).length >= max) {
      return pgError(400, "P0001", "plan_limit_reached");
    }
    const source = {
      id: uuid(),
      project_id: projectId,
      title: String(body.p_title),
      type,
      storage_key: key,
      status,
      created_at: new Date(now).toISOString(),
    } as KnowledgeSource;
    sources.push(source);
    return json({ ...source, reclaimed_storage_keys: reclaimed });
  }

  function claim(body: Record<string, unknown>): KnowledgeSource[] {
    const source = sources.find(
      (s) => s.id === body.p_source_id && s.project_id === body.p_project_id && s.status === "uploading",
    );
    if (!source) return [];
    source.status = "processing";
    return [{ ...source }];
  }

  function rest(method: string, table: string, search: URLSearchParams, headers: Headers, caller: Caller, body: unknown) {
    const filters = eqFilters(search);
    const visible = visibleProjectIds(caller);

    if (method === "POST" && table === "rpc/reserve_knowledge_source") {
      if (caller.kind !== "service") return pgError(403, "42501", "permission denied for function reserve_knowledge_source");
      return reserve(body as Record<string, unknown>);
    }
    if (method === "POST" && table === "rpc/claim_knowledge_source") {
      if (caller.kind !== "service") return pgError(403, "42501", "permission denied for function claim_knowledge_source");
      return rows(headers, claim(body as Record<string, unknown>));
    }
    if (method === "GET" && table === "accounts" && caller.kind === "owner") {
      const plan = accounts.get(caller.userId);
      return rows(headers, plan ? [{ plan }] : []);
    }
    if (method === "GET" && table === "projects") {
      const list = projects
        .filter((p) => visible.has(p.id) && matches(p, filters))
        .map((p) => ({
          ...p,
          public_key: `pk_${p.id.slice(-6)}`,
          messages_used: 0,
          period_start: "2026-11-01T00:00:00+00:00",
          created_at: "2026-11-03T12:00:00.000Z",
        }));
      return rows(headers, list);
    }
    if (table === "knowledge_sources") {
      const scoped = sources.filter((s) => visible.has(s.project_id) && matches(s, filters));
      if (method === "GET") return rows(headers, scoped.map((s) => ({ ...s })));
      if (caller.kind !== "service") return pgError(403, "42501", "permission denied for table knowledge_sources");
      if (method === "PATCH") {
        for (const s of scoped) Object.assign(s, body as object);
        return noContent();
      }
      if (method === "DELETE") {
        for (const s of scoped) {
          sources.splice(sources.indexOf(s), 1);
          // on delete cascade
          for (let i = chunks.length - 1; i >= 0; i--) if (chunks[i]?.source_id === s.id) chunks.splice(i, 1);
        }
        return noContent();
      }
    }
    if (table === "knowledge_chunks" && caller.kind === "service") {
      if (method === "DELETE") {
        for (let i = chunks.length - 1; i >= 0; i--) if (matches(chunks[i] as ChunkRow, filters)) chunks.splice(i, 1);
        return noContent();
      }
      if (method === "POST") {
        for (const row of body as Omit<ChunkRow, "id">[]) {
          // The composite FK: a chunk's source must exist in the same project.
          if (!sources.some((s) => s.id === row.source_id && s.project_id === row.project_id)) {
            return pgError(409, "23503", "insert or update on table knowledge_chunks violates foreign key constraint");
          }
          chunks.push({ id: uuid(), ...row });
        }
        return noContent();
      }
    }
    throw new Error(`fake-supabase: unhandled ${method} /rest/v1/${table} as ${caller.kind}`);
  }

  async function storage(method: string, path: string, caller: Caller, body: unknown) {
    // Only the service role touches the bucket (no storage.objects policies).
    if (caller.kind !== "service") return json({ statusCode: "403", error: "Unauthorized", message: "denied" }, 400);
    const sign = /^object\/upload\/sign\/knowledge\/(.+)$/.exec(path);
    if (method === "POST" && sign?.[1]) {
      const key = decodeURIComponent(sign[1]);
      return json({ url: `/object/upload/sign/knowledge/${key}?token=tok_${encodeURIComponent(key)}` });
    }
    const object = /^object\/knowledge\/(.+)$/.exec(path);
    if (method === "GET" && object?.[1]) {
      const bytes = files.get(decodeURIComponent(object[1]));
      if (!bytes) return json({ statusCode: "404", error: "not_found", message: "Object not found" }, 400);
      return new Response(bytes.slice(), { status: 200 });
    }
    if (method === "DELETE" && path === "object/knowledge") {
      const prefixes = (body as { prefixes: string[] }).prefixes;
      const removed = prefixes.filter((key) => files.delete(key)).map((name) => ({ name }));
      return json(removed);
    }
    throw new Error(`fake-supabase: unhandled ${method} /storage/v1/${path}`);
  }

  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const caller = callerOf(headers);
    const body = typeof init?.body === "string" && init.body ? JSON.parse(init.body) : undefined;
    const restPath = url.pathname.replace(/^\/rest\/v1\//, "");
    requests.push({ method, path: url.pathname, caller, body });

    if (url.pathname.startsWith("/rest/v1/")) return rest(method, restPath, url.searchParams, headers, caller, body);
    if (url.pathname.startsWith("/storage/v1/")) {
      return storage(method, url.pathname.replace(/^\/storage\/v1\//, ""), caller, body);
    }
    throw new Error(`fake-supabase: unhandled ${method} ${url.pathname}`);
  };

  return {
    fetch,
    accounts,
    projects,
    sources,
    chunks,
    files,
    requests,
    /** Moves the clock forward (for the 2-hour reclaim). */
    advance(ms: number) {
      now += ms;
    },
    /** Adds a source as the database would have it. */
    addSource(source: Omit<KnowledgeSource, "id" | "created_at"> & { id?: string; created_at?: string }) {
      const row = { id: source.id ?? uuid(), created_at: source.created_at ?? new Date(now).toISOString(), ...source };
      sources.push(row as KnowledgeSource);
      return row as KnowledgeSource;
    },
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;
