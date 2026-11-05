// TEST-ONLY. An in-memory `accounts` table behind a fake PostgREST, enough
// for storePlan(): PATCH with eq/neq filters (returning the changed rows) and
// POST with on_conflict + ignore-duplicates (returning only inserted rows).
// Only the service key may write, as in the migration. Never import it from app code.
import type { Plan } from "@askwell/shared";

export const SUPABASE_URL = "https://example.supabase.co";
export const PUBLISHABLE_KEY = "sb_publishable_test";
export const SECRET_KEY = "sb_secret_test";

export function createFakeAccounts() {
  const accounts = new Map<string, Plan>();
  const calls: { method: string; search: string; service: boolean }[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const service = headers.get("authorization") === `Bearer ${SECRET_KEY}`;
    calls.push({ method, search: url.search, service });
    if (url.pathname !== "/rest/v1/accounts") return json({ message: `no fake for ${url.pathname}` }, 404);
    if (!service) return json({ code: "42501", message: "permission denied for table accounts" }, 401);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

    if (method === "PATCH") {
      const id = url.searchParams.get("clerk_user_id")?.replace(/^eq\./, "");
      const not = url.searchParams.get("plan")?.replace(/^neq\./, "");
      if (!id || accounts.get(id) === undefined || accounts.get(id) === not) return json([]);
      accounts.set(id, body.plan);
      return json([{ clerk_user_id: id }]);
    }
    if (method === "POST") {
      if (url.searchParams.get("on_conflict") !== "clerk_user_id" || !headers.get("prefer")?.includes("ignore-duplicates")) {
        return json({ message: "fake: expected an insert that ignores duplicates" }, 400);
      }
      const rows = [body].flat() as { clerk_user_id: string; plan: Plan }[];
      const inserted = rows.filter((r) => !accounts.has(r.clerk_user_id));
      for (const r of inserted) accounts.set(r.clerk_user_id, r.plan);
      return json(inserted.map((r) => ({ clerk_user_id: r.clerk_user_id })), 201);
    }
    return json({ message: `fake: unsupported ${method}` }, 405);
  }

  return { accounts, calls, fetch };
}
