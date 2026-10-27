// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { argsOf, callsTo, fakeSupabase, type FakeHandlers, type FakeSupabase } from "../../../../lib/supabase/fake";

// The conversation is read through the owner client (RLS); that RLS hides another owner's
// conversation is tested against the real migrations on pglite (packages/db). Here, another
// owner's conversation is one the fake owner client doesn't return.
vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ userId: null as string | null, owner: undefined as unknown }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));
vi.mock("../../../../lib/supabase/owner", () => ({ createOwnerClient: () => state.owner }));

const { GET } = await import("./route");

const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";

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
    const res = await GET(req(), ctx(CONVERSATION_ID));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/conversations/:id", () => {
  it("returns the conversation with its messages", async () => {
    signIn("owner_a", {
      from: {
        conversations: {
          data: { id: CONVERSATION_ID, project_id: "p1", visitor_id: "v1", created_at: "2026-10-01T00:00:00+00:00" },
        },
        // One page of messages, then an empty one (fetchAll stops on an empty page).
        messages: [
          { data: [{ id: "m1", role: "visitor", body: "Hi", created_at: "2026-10-01T00:00:01+00:00" }] },
          { data: [] },
        ],
      },
    });

    const res = await GET(req(), ctx(CONVERSATION_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conversation).toEqual({
      id: CONVERSATION_ID,
      visitorId: "v1",
      createdAt: "2026-10-01T00:00:00.000Z",
      messages: [{ id: "m1", role: "visitor", body: "Hi", createdAt: "2026-10-01T00:00:01.000Z" }],
    });
    expect(argsOf(callsTo(owner, "conversations")[0], "eq")).toEqual(["id", CONVERSATION_ID]);
    expect(argsOf(callsTo(owner, "messages")[0], "eq")).toEqual(["conversation_id", CONVERSATION_ID]);
  });

  it("returns 404 for another owner's conversation", async () => {
    signIn("owner_c");

    const res = await GET(req(), ctx(CONVERSATION_ID));

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(callsTo(owner, "messages")).toEqual([]);
  });

  it("returns 404 for an unknown or malformed id", async () => {
    signIn("owner_d");
    expect((await GET(req(), ctx("00000000-0000-4000-8000-000000000000"))).status).toBe(404);
    expect((await GET(req(), ctx("not-a-uuid"))).status).toBe(404);
    // The malformed id never reaches the database.
    expect(owner.calls).toHaveLength(1);
  });
});
