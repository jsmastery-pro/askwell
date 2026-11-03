// TEST-ONLY. A tiny in-memory stand-in for the Supabase Data API, enough for
// the projects routes: it tells callers apart by their Authorization header
// (an owner's Clerk token vs the secret key), applies RLS the way the
// migrations do (owners see and change only their own rows; service_role sees
// everything), and runs create_project() with its plan-limit check.
// Never import it from app code.
import type { Plan, Project } from "@askwell/shared";

export const SECRET_KEY = "sb_secret_test";
export const PUBLISHABLE_KEY = "sb_publishable_test";
export const SUPABASE_URL = "https://example.supabase.co";

/** The Clerk session token the fake Clerk issues for `userId`. */
export const tokenFor = (userId: string) => `clerk-token-for:${userId}`;

export type RecordedRequest = {
  method: string;
  path: string;
  search: URLSearchParams;
  caller: { kind: "owner"; userId: string } | { kind: "service" } | { kind: "anon" };
  body: unknown;
};

type Caller = RecordedRequest["caller"];

export function createFakePostgrest() {
  const accounts = new Map<string, Plan>();
  const projects: Project[] = [];
  const configs = new Set<string>();
  const requests: RecordedRequest[] = [];
  /** Public keys create_project should treat as already taken (to test the retry). */
  const takenKeys = new Set<string>();
  let clock = Date.parse("2026-11-03T12:00:00Z");
  let nextId = 1;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const pgError = (status: number, code: string, message: string) =>
    json({ code, message, details: null, hint: null }, status);

  function callerOf(headers: Headers): Caller {
    const bearer = headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (bearer === SECRET_KEY) return { kind: "service" };
    if (bearer.startsWith("clerk-token-for:")) return { kind: "owner", userId: bearer.slice(16) };
    return { kind: "anon" };
  }

  /** RLS: owners see only their projects; service_role sees all; anon nothing. */
  function visible(caller: Caller): Project[] {
    if (caller.kind === "service") return projects;
    if (caller.kind === "owner") return projects.filter((p) => p.owner_id === caller.userId);
    return [];
  }

  function eqFilter(search: URLSearchParams, column: string): string | null {
    const value = search.get(column);
    return value?.startsWith("eq.") ? value.slice(3) : null;
  }

  function createProject(args: Record<string, unknown>): Response {
    const owner = String(args.p_owner_id);
    const max = args.p_max_projects;
    if (typeof max !== "number" || max < 0) return pgError(400, "22023", "invalid_max_projects");
    if (!accounts.has(owner)) return pgError(400, "P0002", "account_not_found");
    if (projects.filter((p) => p.owner_id === owner).length >= max) {
      return pgError(400, "P0001", "plan_limit_reached");
    }
    const key = String(args.p_public_key);
    if (takenKeys.has(key) || projects.some((p) => p.public_key === key)) {
      takenKeys.delete(key);
      return pgError(409, "23505", 'duplicate key value violates unique constraint "projects_public_key_key"');
    }
    clock += 1000;
    const project: Project = {
      id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
      owner_id: owner,
      name: String(args.p_name),
      public_key: key,
      messages_used: 0,
      period_start: "2026-11-01T00:00:00+00:00",
      created_at: new Date(clock).toISOString(),
    };
    projects.push(project);
    configs.add(project.id);
    return json(project);
  }

  async function handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const caller = callerOf(headers);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const path = url.pathname.replace(/^\/rest\/v1\//, "");
    requests.push({ method, path, search: url.searchParams, caller, body });

    if (path === "rpc/create_project" && method === "POST") {
      if (caller.kind !== "service") return pgError(401, "42501", "permission denied for function create_project");
      return createProject(body as Record<string, unknown>);
    }

    if (path === "accounts") {
      if (method === "POST") {
        if (caller.kind !== "service") return pgError(401, "42501", "permission denied for table accounts");
        for (const row of [body].flat() as { clerk_user_id: string }[]) {
          if (!accounts.has(row.clerk_user_id)) accounts.set(row.clerk_user_id, "free");
        }
        return new Response(null, { status: 201 });
      }
      if (method === "GET") {
        if (caller.kind !== "owner") return json([]);
        const plan = accounts.get(caller.userId);
        return json(plan ? [{ plan }] : []);
      }
    }

    if (path === "projects") {
      if (caller.kind === "anon") return pgError(401, "42501", "permission denied for table projects");
      const id = eqFilter(url.searchParams, "id");
      const matching = visible(caller).filter((p) => id === null || p.id === id);

      if (method === "GET") {
        const order = url.searchParams.get("order") ?? "";
        const sorted = [...matching];
        if (order.startsWith("created_at.desc")) {
          sorted.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
        }
        return json(sorted);
      }
      if (method === "PATCH") {
        // Owners may update only `name` (column grant).
        if (caller.kind === "owner" && Object.keys(body ?? {}).some((k) => k !== "name")) {
          return pgError(401, "42501", "permission denied for table projects");
        }
        for (const project of matching) Object.assign(project, body);
        return json(matching);
      }
      if (method === "DELETE") {
        for (const project of matching) {
          projects.splice(projects.indexOf(project), 1);
          configs.delete(project.id); // on delete cascade
        }
        return json(matching.map((p) => ({ id: p.id })));
      }
    }

    return pgError(404, "PGRST205", `No fake for ${method} ${path}`);
  }

  return { accounts, projects, configs, requests, takenKeys, fetch: handle };
}

export type FakePostgrest = ReturnType<typeof createFakePostgrest>;
