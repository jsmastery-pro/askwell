// TEST-ONLY. The projects fake PostgREST (lib/projects/fake-postgrest.ts)
// plus conversations and messages, with the RLS of the initial migration:
// owners read rows in their own projects only, anon nothing. It understands
// what lib/conversations sends: eq/in filters, the keyset or(), multi-column
// order, limit, offset+limit ranges with count=exact, and PostgREST's
// max-rows cap. Never import it from app code.
import type { Conversation, Message } from "@askwell/shared";
import { createFakePostgrest, SECRET_KEY } from "../projects/fake-postgrest";

export { PUBLISHABLE_KEY, SECRET_KEY, SUPABASE_URL, tokenFor } from "../projects/fake-postgrest";

type Caller = { kind: "owner"; userId: string } | { kind: "service" } | { kind: "anon" };
type Row = Record<string, string>;

export function createFakeConversations() {
  const base = createFakePostgrest();
  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  /** Every conversations/messages request, with who sent it. */
  const reads: { table: string; caller: Caller; search: URLSearchParams }[] = [];
  /** PostgREST's max-rows: no response has more rows than this. */
  const settings = { maxRows: 1000 };

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  function callerOf(headers: Headers): Caller {
    const bearer = headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (bearer === SECRET_KEY) return { kind: "service" };
    if (bearer.startsWith("clerk-token-for:")) return { kind: "owner", userId: bearer.slice(16) };
    return { kind: "anon" };
  }

  /** RLS: the project ids the caller may read in. */
  function ownedProjectIds(caller: Caller): Set<string> {
    if (caller.kind === "service") return new Set(base.projects.map((p) => p.id));
    if (caller.kind === "owner") return new Set(base.projects.filter((p) => p.owner_id === caller.userId).map((p) => p.id));
    return new Set();
  }

  const unquote = (value: string) => value.replace(/^"(.*)"$/, "$1");

  /** column=eq.x and column=in.(a,b) filters. */
  function matchesFilters(row: Row, search: URLSearchParams): boolean {
    for (const [column, value] of search) {
      if (["select", "order", "limit", "offset", "or"].includes(column)) continue;
      if (value.startsWith("eq.")) {
        if (row[column] !== unquote(value.slice(3))) return false;
      } else if (value.startsWith("in.(") && value.endsWith(")")) {
        const list = value.slice(4, -1).split(",").map(unquote);
        if (!list.includes(row[column] ?? "")) return false;
      } else {
        throw new Error(`fake: unsupported filter ${column}=${value}`);
      }
    }
    return true;
  }

  /** The keyset or() lib/conversations sends, and nothing else. */
  function matchesOr(row: Row, value: string | null): boolean {
    if (value === null) return true;
    const m = /^\(created_at\.lt\."([^"]+)",and\(created_at\.eq\."([^"]+)",id\.lt\."([^"]+)"\)\)$/.exec(value);
    if (!m || m[1] !== m[2]) throw new Error(`fake: unsupported or=${value}`);
    const [, at, , id] = m as unknown as [string, string, string, string];
    const created = row.created_at ?? "";
    return created < at || (created === at && (row.id ?? "") < id);
  }

  /** order=a.asc,b.desc (values are uniform ISO strings, so string order is time order). */
  function sortBy(rows: Row[], order: string | null): Row[] {
    if (!order) return rows;
    const keys = order.split(",").map((part) => {
      const [column = "", direction = "asc"] = part.split(".");
      return { column, sign: direction === "desc" ? -1 : 1 };
    });
    return [...rows].sort((a, b) => {
      for (const { column, sign } of keys) {
        const cmp = (a[column] ?? "").localeCompare(b[column] ?? "");
        if (cmp !== 0) return cmp * sign;
      }
      return 0;
    });
  }

  function pick(row: Row, select: string | null): Row {
    if (!select || select === "*") return row;
    return Object.fromEntries(select.split(",").map((c) => c.trim()).map((c) => [c, row[c] ?? ""]));
  }

  function read(table: string, rows: Row[], url: URL, headers: Headers): Response {
    const search = url.searchParams;
    const matching = sortBy(
      rows.filter((r) => matchesFilters(r, search) && matchesOr(r, search.get("or"))),
      search.get("order"),
    );
    const offset = Number(search.get("offset") ?? 0);
    const limit = Math.min(Number(search.get("limit") ?? Infinity), settings.maxRows);
    const page = matching.slice(offset, offset + limit).map((r) => pick(r, search.get("select")));
    const extra: Record<string, string> = {};
    if (headers.get("prefer")?.includes("count=exact")) {
      extra["content-range"] = page.length ? `${offset}-${offset + page.length - 1}/${matching.length}` : `*/${matching.length}`;
    }
    return json(page, 200, extra);
  }

  async function handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/rest\/v1\//, "");
    if (path !== "conversations" && path !== "messages") return base.fetch(input, init);

    const headers = new Headers(init?.headers);
    const caller = callerOf(headers);
    reads.push({ table: path, caller, search: url.searchParams });
    if ((init?.method ?? "GET") !== "GET") return json({ code: "42501", message: "permission denied" }, 401);
    if (caller.kind === "anon") return json({ code: "42501", message: `permission denied for table ${path}` }, 401);

    const owned = ownedProjectIds(caller);
    const visibleConversations = conversations.filter((c) => owned.has(c.project_id));
    if (path === "conversations") return read(path, visibleConversations, url, headers);
    const visibleIds = new Set(visibleConversations.map((c) => c.id));
    return read(path, messages.filter((m) => visibleIds.has(m.conversation_id)), url, headers);
  }

  return { ...base, conversations, messages, reads, settings, fetch: handle };
}

export type FakeConversations = ReturnType<typeof createFakeConversations>;
