// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { argsOf, callsTo, fakeSupabase, type FakeHandlers, type FakeSupabase } from "../../../../../lib/supabase/fake";

// The project and its conversations are read through the owner client (RLS); that RLS hides
// another owner's project is tested against the real migrations on pglite (packages/db). Here,
// another owner's project is one the fake owner client doesn't return.
vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ userId: null as string | null, owner: undefined as unknown }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));
vi.mock("../../../../../lib/supabase/owner", () => ({ createOwnerClient: () => state.owner }));
vi.mock("../../../../../lib/supabase/service", () => ({
  createServiceClient: () => {
    throw new Error("real service client used in a test");
  },
}));

const { GET } = await import("./route");

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";

let owner: FakeSupabase;

function signIn(userId: string, handlers: FakeHandlers = {}) {
  state.userId = userId;
  owner = fakeSupabase(handlers);
  state.owner = owner;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("https://app.test");

beforeEach(() => {
  state.userId = null;
  state.owner = undefined;
});

describe("unauthenticated", () => {
  it("returns 401", async () => {
    const res = await GET(req(), ctx(PROJECT_ID));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/projects/:id/conversations", () => {
  it("lists the project's conversations", async () => {
    signIn("owner_a", {
      from: {
        projects: { data: { id: PROJECT_ID, owner_id: "owner_a" } },
        // One page, then an empty one (fetchAll stops on an empty page).
        conversations: [
          {
            data: [
              {
                id: "c1",
                visitor_id: "v1",
                created_at: "2026-10-01T00:00:00+00:00",
                message_count: [{ count: 2 }],
                preview: [{ body: "Hi" }],
              },
            ],
          },
          { data: [] },
        ],
      },
    });

    const res = await GET(req(), ctx(PROJECT_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conversations).toEqual([
      { id: "c1", visitorId: "v1", messageCount: 2, preview: "Hi", createdAt: "2026-10-01T00:00:00.000Z" },
    ]);
    expect(argsOf(callsTo(owner, "projects")[0], "eq")).toEqual(["id", PROJECT_ID]);
    const [list] = callsTo(owner, "conversations");
    expect(list?.ops).toContainEqual(["eq", "project_id", PROJECT_ID]);
  });

  it("returns 404 for another owner's project", async () => {
    signIn("owner_c");

    const res = await GET(req(), ctx(PROJECT_ID));

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(callsTo(owner, "conversations")).toEqual([]);
  });

  it("returns 404 for a malformed id", async () => {
    signIn("owner_d");
    const res = await GET(req(), ctx("not-a-uuid"));
    expect(res.status).toBe(404);
    expect(owner.calls).toEqual([]);
  });
});
