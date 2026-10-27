// @vitest-environment node
import { PLAN_LIMITS } from "@askwell/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { argsOf, callsTo, fakeSupabase, type FakeHandlers, type FakeSupabase } from "../../../lib/supabase/fake";

// The routes run against fake owner and service clients. Which rows RLS lets an owner list,
// rename or delete is tested against the real migrations on pglite (packages/db); here, another
// owner's project is one the fake owner client doesn't return.
vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ userId: null as string | null, owner: undefined as unknown, service: undefined as unknown }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));
vi.mock("../../../lib/supabase/owner", () => ({ createOwnerClient: () => state.owner }));
vi.mock("../../../lib/supabase/service", () => ({ createServiceClient: () => state.service }));
vi.mock("../../../lib/posthog/server", () => ({ captureServerEvent: vi.fn() }));

const collection = await import("./route");
const item = await import("./[id]/route");

const PROJECT_ID = "11111111-2222-4333-8444-555555555555";

const projectRow = (overrides: Record<string, unknown> = {}) => ({
  id: PROJECT_ID,
  owner_id: "owner_a",
  name: "Docs bot",
  public_key: "pk_abcdefghijklmnopqrstuvwxyz012345",
  messages_used: 0,
  period_start: "2026-10-01T00:00:00+00:00",
  created_at: "2026-10-01T00:00:00+00:00",
  ...overrides,
});

let owner: FakeSupabase;
let service: FakeSupabase;

/** Signs in `userId` with fresh owner and service fakes. */
function signIn(userId: string, handlers: { owner?: FakeHandlers; service?: FakeHandlers } = {}) {
  state.userId = userId;
  owner = fakeSupabase(handlers.owner);
  service = fakeSupabase(handlers.service);
  state.owner = owner;
  state.service = service;
}

beforeEach(() => {
  state.userId = null;
  state.owner = undefined;
  state.service = undefined;
  vi.stubEnv("BUCKET_NAME", "askwell-test");
});

const jsonRequest = (method: string, body?: unknown) =>
  new Request("https://app.test/api/projects", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("unauthenticated", () => {
  it("returns 401 on every route, without querying", async () => {
    const responses = [
      await collection.GET(),
      await collection.POST(jsonRequest("POST", { name: "X" })),
      await item.PATCH(jsonRequest("PATCH", { name: "X" }), ctx(PROJECT_ID)),
      await item.DELETE(jsonRequest("DELETE"), ctx(PROJECT_ID)),
    ];
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("unauthorized");
    }
  });
});

describe("GET /api/projects", () => {
  it("lists what the owner client returns, as API projects", async () => {
    signIn("owner_a", { owner: { from: { projects: { data: [projectRow()] } } } });

    const res = await collection.GET();

    expect(res.status).toBe(200);
    expect((await res.json()).projects).toEqual([
      expect.objectContaining({ id: PROJECT_ID, name: "Docs bot", publicKey: "pk_abcdefghijklmnopqrstuvwxyz012345" }),
    ]);
    expect(service.calls).toEqual([]);
  });

  it("sends no CORS headers (owner routes are same-origin)", async () => {
    signIn("owner_a");
    expect((await collection.GET()).headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("POST /api/projects", () => {
  const createHandlers = (rpc: FakeHandlers["rpc"] = { create_project: { data: projectRow() } }) => ({
    owner: { from: { accounts: { data: { plan: "free" } } } },
    service: { from: { accounts: { data: [] } }, rpc },
  });

  it("creates through create_project with the owner's plan limit, and returns 201", async () => {
    signIn("owner_a", createHandlers());

    const res = await collection.POST(jsonRequest("POST", { name: "Docs bot" }));

    expect(res.status).toBe(201);
    expect((await res.json()).project).toMatchObject({ id: PROJECT_ID, name: "Docs bot" });
    const [args] = argsOf(callsTo(service, "create_project")[0], "args") as [Record<string, unknown>];
    expect(args).toMatchObject({ p_owner_id: "owner_a", p_name: "Docs bot", p_project_limit: PLAN_LIMITS.free.projects });
  });

  it("refuses with 403 plan_limit when create_project raises AWLIM", async () => {
    signIn("owner_a", createHandlers({ create_project: { error: { code: "AWLIM", message: "project limit reached (1)" } } }));

    const res = await collection.POST(jsonRequest("POST", { name: "Second" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("plan_limit");
    expect(body.error.message).toBe("Your plan allows 1 project. Upgrade to add more.");
  });

  it("rejects a blank name and a non-JSON body with 400, creating nothing", async () => {
    signIn("owner_a", createHandlers());
    expect((await collection.POST(jsonRequest("POST", { name: "   " }))).status).toBe(400);
    expect((await collection.POST(new Request("https://app.test/api/projects", { method: "POST", body: "{" }))).status).toBe(400);
    expect(service.calls).toEqual([]);
  });
});

describe("PATCH /api/projects/:id", () => {
  it("renames through the owner client", async () => {
    signIn("owner_a", { owner: { from: { projects: { data: projectRow({ name: "New" }) } } } });

    const res = await item.PATCH(jsonRequest("PATCH", { name: "New" }), ctx(PROJECT_ID));

    expect(res.status).toBe(200);
    expect((await res.json()).project.name).toBe("New");
    expect(argsOf(callsTo(owner, "projects")[0], "update")).toEqual([{ name: "New" }]);
    expect(service.calls).toEqual([]);
  });

  it("returns 404 for another owner's project (RLS returns no row)", async () => {
    signIn("owner_b");
    const res = await item.PATCH(jsonRequest("PATCH", { name: "Mine now" }), ctx(PROJECT_ID));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("rejects a blank name with 400 before touching the project", async () => {
    signIn("owner_a");
    expect((await item.PATCH(jsonRequest("PATCH", { name: "" }), ctx(PROJECT_ID))).status).toBe(400);
    expect(owner.calls).toEqual([]);
  });
});

describe("DELETE /api/projects/:id", () => {
  it("deletes the owner's project, then its files in Storage", async () => {
    signIn("owner_a", {
      owner: {
        from: { knowledge_sources: { data: [{ storage_key: "projects/p/a" }] }, projects: { data: [{ id: PROJECT_ID }] } },
      },
    });

    const res = await item.DELETE(jsonRequest("DELETE"), ctx(PROJECT_ID));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(argsOf(callsTo(owner, "projects")[0], "delete")).toEqual([]);
    expect(argsOf(callsTo(service, "askwell-test")[0], "remove")).toEqual([["projects/p/a"]]);
  });

  it("returns 404 for another owner's project, removing no files", async () => {
    signIn("owner_b", { owner: { from: { knowledge_sources: { data: [] }, projects: { data: [] } } } });

    expect((await item.DELETE(jsonRequest("DELETE"), ctx(PROJECT_ID))).status).toBe(404);
    expect(service.calls).toEqual([]);
  });

  it("returns 404 for a malformed id without querying", async () => {
    signIn("owner_a");

    expect((await item.DELETE(jsonRequest("DELETE"), ctx("not-a-uuid"))).status).toBe(404);
    expect((await item.PATCH(jsonRequest("PATCH", { name: "X" }), ctx("not-a-uuid"))).status).toBe(404);
    expect([...owner.calls, ...service.calls]).toEqual([]);
  });
});
