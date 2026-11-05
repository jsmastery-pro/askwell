import { createClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { DEFAULT_WIDGET_CONFIG, type Plan } from "@askwell/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The real route and lib/widget/update-config.ts. Clerk's auth(), ownership
// (getOwnedProject: owner client + RLS, tested in lib/projects) and the plan
// read (getOwnPlan, tested in lib/accounts) are mocked. The service client is
// the real supabase-js against a fake PostgREST `widget_configs` table.
vi.mock("server-only", () => ({}));

let signedInAs: string | null = "user_alice";
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ isAuthenticated: signedInAs !== null, userId: signedInAs }),
}));

const ALICES = "11111111-1111-4111-8111-111111111111";
const BOBS = "22222222-2222-4222-8222-222222222222";
const owners: Record<string, string> = { [ALICES]: "user_alice", [BOBS]: "user_bob" };
const getOwnedProject = vi.fn(async (id: string) =>
  owners[id] === signedInAs ? { id, owner_id: signedInAs, name: "Bot" } : null,
);
vi.mock("../../../../../lib/projects/projects", () => ({ getOwnedProject: (id: string) => getOwnedProject(id) }));

let plan: Plan = "pro";
const getOwnPlan = vi.fn(async () => plan);
vi.mock("../../../../../lib/accounts/account", () => ({ getOwnPlan: () => getOwnPlan() }));

type Row = typeof DEFAULT_WIDGET_CONFIG & { project_id: string };
const table = new Map<string, Row>();
let failWrite = false;
const writes: { method: string; projectId: string | null; body: unknown; apikey: string | null }[] = [];

async function postgrest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  if (!url.pathname.endsWith("/widget_configs") || init?.method !== "PATCH") throw new Error(`Unexpected ${url}`);
  const projectId = url.searchParams.get("project_id")?.replace(/^eq\./, "") ?? null;
  const body = JSON.parse(String(init.body)) as Partial<Row>;
  writes.push({ method: init.method, projectId, body, apikey: new Headers(init.headers).get("apikey") });
  if (failWrite) {
    return Response.json({ code: "42501", message: "permission denied", details: null, hint: null }, { status: 403 });
  }
  const row = projectId ? table.get(projectId) : undefined;
  if (!row) return Response.json([]);
  Object.assign(row, body);
  return Response.json([row]);
}
vi.mock("../../../../../lib/supabase/service", () => ({
  createServiceClient: () =>
    createClient<Database>("https://example.supabase.co", "service-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: postgrest },
    }),
}));

const { PATCH } = await import("./route");

const patch = (id: string, body: unknown) =>
  PATCH(
    new Request(`https://askwell.test/api/projects/${id}/config`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) } as never,
  );

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(await res.json()).toMatchObject({ error: { code } });
}

beforeEach(() => {
  signedInAs = "user_alice";
  plan = "pro";
  failWrite = false;
  table.clear();
  table.set(ALICES, { project_id: ALICES, ...DEFAULT_WIDGET_CONFIG });
  table.set(BOBS, { project_id: BOBS, ...DEFAULT_WIDGET_CONFIG });
  writes.length = 0;
  getOwnedProject.mockClear();
  getOwnPlan.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/projects/:id/config", () => {
  it("Free → 402 payment_required, and nothing is written", async () => {
    plan = "free";
    await expectError(await patch(ALICES, { button_color: "#e11d48" }), 402, "payment_required");
    expect(writes).toEqual([]);
    expect(table.get(ALICES)?.button_color).toBe(DEFAULT_WIDGET_CONFIG.button_color);
  });

  it("Pro → 200 { config } with the stored values, written with the service client", async () => {
    const res = await patch(ALICES, { button_color: "#e11d48" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      config: { project_id: ALICES, ...DEFAULT_WIDGET_CONFIG, button_color: "#e11d48" },
    });
    expect(writes).toEqual([
      { method: "PATCH", projectId: ALICES, body: { button_color: "#e11d48" }, apikey: "service-key" },
    ]);
  });

  it("a partial body changes only the sent fields", async () => {
    await patch(ALICES, { label: "Questions?", show_badge: false });
    const res = await patch(ALICES, { position: "bottom-left" });
    const { config } = await res.json();
    expect(config).toEqual({
      project_id: ALICES,
      ...DEFAULT_WIDGET_CONFIG,
      label: "Questions?",
      show_badge: false,
      position: "bottom-left",
    });
    expect(writes.map((w) => w.body)).toEqual([{ label: "Questions?", show_badge: false }, { position: "bottom-left" }]);
  });

  it("another owner's project → 404, before the plan read or any write", async () => {
    await expectError(await patch(BOBS, { button_color: "#e11d48" }), 404, "not_found");
    expect(getOwnPlan).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
    expect(table.get(BOBS)?.button_color).toBe(DEFAULT_WIDGET_CONFIG.button_color);
  });

  it("no session → 401, nothing read or written", async () => {
    signedInAs = null;
    await expectError(await patch(ALICES, { button_color: "#e11d48" }), 401, "unauthorized");
    expect(getOwnedProject).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it.each([
    ["an empty body", {}],
    ["an unknown field", { button_color: "#e11d48", plan: "pro" }],
    ["a bad color", { button_color: "red" }],
    ["a bad position", { position: "middle" }],
    ["not JSON", "{nope"],
  ])("%s → 400 validation_failed, before ownership or plan", async (_name, body) => {
    await expectError(await patch(ALICES, body), 400, "validation_failed");
    expect(getOwnedProject).not.toHaveBeenCalled();
    expect(getOwnPlan).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("a bad project id → 400", async () => {
    await expectError(await patch("not-a-uuid", { label: "Hi" }), 400, "validation_failed");
  });

  it("a missing config row → 404", async () => {
    table.delete(ALICES);
    await expectError(await patch(ALICES, { label: "Hi" }), 404, "not_found");
  });

  it("a failed plan read → 500 internal, nothing written, nothing about the cause", async () => {
    getOwnPlan.mockRejectedValueOnce(new Error("db down: secret detail"));
    const res = await patch(ALICES, { label: "Hi" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: { code: "internal" } });
    expect(JSON.stringify(body)).not.toContain("secret detail");
    expect(writes).toEqual([]);
  });

  it("a failed write → 500 internal, nothing about the cause", async () => {
    failWrite = true;
    const res = await patch(ALICES, { label: "Hi" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: { code: "internal" } });
    expect(JSON.stringify(body)).not.toContain("permission denied");
  });
});
