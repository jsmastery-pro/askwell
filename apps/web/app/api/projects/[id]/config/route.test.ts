// @vitest-environment node
import { WIDGET_DEFAULTS } from "@askwell/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { argsOf, callsTo, fakeSupabase, type FakeSupabase } from "../../../../../lib/supabase/fake";

// Ownership and the plan are read through a fake owner client; the save goes through a fake
// service client, since owners have no write policy on widget_configs. That RLS hides another
// owner's project and refuses an owner's direct write is tested on pglite (packages/db).
vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ userId: null as string | null, owner: undefined as unknown, service: undefined as unknown }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));
vi.mock("../../../../../lib/supabase/owner", () => ({ createOwnerClient: () => state.owner }));
vi.mock("../../../../../lib/supabase/service", () => ({ createServiceClient: () => state.service }));

const { PATCH } = await import("./route");

const PROJECT_ID = "11111111-2222-4333-8444-555555555555";

/** The stored row as the database returns it after a save: column defaults unless overridden. */
const storedRow = (overrides: Record<string, unknown> = {}) => ({
  button_color: null,
  position: "bottom-right",
  label: null,
  animation: "fade",
  header_text: null,
  show_badge: true,
  ...overrides,
});

let owner: FakeSupabase;
let service: FakeSupabase;

/** Signs in an owner whose plan is `plan` and who owns the project unless `owns` is false. */
function signIn(plan: "free" | "pro", { owns = true, saved = storedRow() } = {}) {
  state.userId = "owner_a";
  owner = fakeSupabase({
    from: { projects: { data: owns ? { id: PROJECT_ID } : null }, accounts: { data: { plan } } },
  });
  service = fakeSupabase({ from: { widget_configs: { data: saved } } });
  state.owner = owner;
  state.service = service;
}

beforeEach(() => {
  state.userId = null;
  state.owner = undefined;
  state.service = undefined;
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown) =>
  new Request("https://app.test/api/projects/x/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("unauthenticated", () => {
  it("returns 401", async () => {
    const res = await PATCH(patch({ label: "x" }), ctx(PROJECT_ID));
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/projects/:id/config", () => {
  it("returns 404 for another owner's project, writing nothing", async () => {
    signIn("pro", { owns: false });

    const res = await PATCH(patch({ label: "New" }), ctx(PROJECT_ID));

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(service.calls).toEqual([]);
  });

  it("returns 404 for a malformed id without querying", async () => {
    signIn("pro");

    const res = await PATCH(patch({ label: "New" }), ctx("not-a-uuid"));

    expect(res.status).toBe(404);
    expect([...owner.calls, ...service.calls]).toEqual([]);
  });

  it("refuses a Free owner with 402 and writes nothing", async () => {
    signIn("free");

    const res = await PATCH(patch({ label: "New label" }), ctx(PROJECT_ID));

    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe("payment_required");
    expect(service.calls).toEqual([]);
  });

  it("reads the plan on the server, ignoring any plan in the body", async () => {
    signIn("free");

    const res = await PATCH(patch({ label: "New label", plan: "pro" }), ctx(PROJECT_ID));

    expect(res.status).toBe(402);
    expect(callsTo(owner, "accounts")).toHaveLength(1);
  });

  it("rejects an invalid body with 400, writing nothing", async () => {
    signIn("pro");

    const res = await PATCH(patch({ buttonColor: "not-a-hex-color" }), ctx(PROJECT_ID));

    expect(res.status).toBe(400);
    expect(service.calls).toEqual([]);
  });

  it("saves only the changed fields through the service client and returns the config", async () => {
    signIn("pro", { saved: storedRow({ position: "top-right", label: "Ask us anything" }) });

    const res = await PATCH(patch({ position: "top-right", label: "Ask us anything" }), ctx(PROJECT_ID));

    expect(res.status).toBe(200);
    expect((await res.json()).config).toEqual({ ...WIDGET_DEFAULTS, position: "top-right", label: "Ask us anything" });
    expect(argsOf(callsTo(service, "widget_configs")[0], "upsert")).toEqual([
      { project_id: PROJECT_ID, position: "top-right", label: "Ask us anything" },
      { onConflict: "project_id" },
    ]);
    expect(callsTo(owner, "widget_configs")).toEqual([]);
  });

  it("resets a text field to its default on null", async () => {
    signIn("pro", { saved: storedRow({ label: "Custom label" }) });

    const res = await PATCH(patch({ buttonColor: null }), ctx(PROJECT_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.config.buttonColor).toBe(WIDGET_DEFAULTS.buttonColor);
    expect(body.config.label).toBe("Custom label");
    expect(argsOf(callsTo(service, "widget_configs")[0], "upsert")?.[0]).toEqual({ project_id: PROJECT_ID, button_color: null });
  });
});
