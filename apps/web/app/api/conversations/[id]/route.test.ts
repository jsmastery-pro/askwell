import type { Project } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeConversations,
  PUBLISHABLE_KEY,
  SECRET_KEY,
  SUPABASE_URL,
  tokenFor,
  type FakeConversations,
} from "../../../../lib/conversations/fake-conversations";

vi.mock("server-only", () => ({}));
let signedInAs: string | null = null;
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    isAuthenticated: signedInAs !== null,
    userId: signedInAs,
    getToken: async () => (signedInAs ? tokenFor(signedInAs) : null),
  }),
}));

const { GET } = await import("./route");

const ALICES = "00000000-0000-4000-8000-00000000000a";
const BOBS = "00000000-0000-4000-8000-00000000000b";
const ALICE_CHAT = "20000000-0000-4000-8000-000000000001";
const BOB_CHAT = "20000000-0000-4000-8000-000000000002";
let db: FakeConversations;

const at = (n: number) => new Date(Date.parse("2026-11-04T10:00:00Z") + n * 1000).toISOString();
const mid = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function project(id: string, owner: string) {
  const p: Project = {
    id,
    owner_id: owner,
    name: "bot",
    public_key: `pk_${id.slice(-6)}`,
    messages_used: 0,
    period_start: "2026-11-01T00:00:00+00:00",
    created_at: "2026-11-03T12:00:00.000Z",
  };
  db.projects.push(p);
}

async function get(id: string) {
  const res = await GET(new Request(`http://localhost/api/conversations/${id}`), {
    params: Promise.resolve({ id }),
  } as never);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  db = createFakeConversations();
  vi.stubGlobal("fetch", db.fetch);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubEnv(["SUPABASE", "SECRET", "KEY"].join("_"), SECRET_KEY);
  project(ALICES, "user_alice");
  project(BOBS, "user_bob");
  db.conversations.push(
    { id: ALICE_CHAT, project_id: ALICES, visitor_id: "v_a", created_at: at(0) },
    { id: BOB_CHAT, project_id: BOBS, visitor_id: "v_b", created_at: at(0) },
  );
  signedInAs = "user_alice";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/conversations/:id", () => {
  it("returns the conversation and its messages oldest first (stored out of order)", async () => {
    db.messages.push(
      { id: mid(3), conversation_id: ALICE_CHAT, role: "bot", body: "Yes, worldwide.", created_at: at(3) },
      { id: mid(1), conversation_id: ALICE_CHAT, role: "visitor", body: "Do you ship to Canada?", created_at: at(1) },
      { id: mid(9), conversation_id: BOB_CHAT, role: "visitor", body: "Bob's", created_at: at(2) },
    );
    const { status, body } = await get(ALICE_CHAT);
    expect(status).toBe(200);
    expect(body.conversation).toEqual({ id: ALICE_CHAT, project_id: ALICES, visitor_id: "v_a", created_at: at(0) });
    expect(body.messages.map((m: { role: string; body: string }) => [m.role, m.body])).toEqual([
      ["visitor", "Do you ship to Canada?"],
      ["bot", "Yes, worldwide."],
    ]);
    expect(db.reads.every((r) => r.caller.kind === "owner")).toBe(true);
  });

  it("returns every message past PostgREST's max-rows, in order", async () => {
    db.settings.maxRows = 4;
    for (let i = 0; i < 11; i++) {
      db.messages.push({ id: mid(i), conversation_id: ALICE_CHAT, role: i % 2 ? "bot" : "visitor", body: `m${i}`, created_at: at(i) });
    }
    const { body } = await get(ALICE_CHAT);
    expect(body.messages.map((m: { body: string }) => m.body)).toEqual(Array.from({ length: 11 }, (_, i) => `m${i}`));
  });

  it("a conversation with no messages yet → an empty list", async () => {
    expect((await get(ALICE_CHAT)).body.messages).toEqual([]);
  });

  it("another owner's conversation → 404 not_found, and its messages are never read", async () => {
    const { status, body } = await get(BOB_CHAT);
    expect(status).toBe(404);
    expect(body).toEqual({ error: { code: "not_found", message: "Conversation not found." } });
    expect(db.reads.map((r) => r.table)).toEqual(["conversations"]);
  });

  it("an unknown id → 404; a non-uuid id → 400", async () => {
    expect((await get("20000000-0000-4000-8000-999999999999")).status).toBe(404);
    expect((await get("nope")).status).toBe(400);
  });

  it("signed out → 401", async () => {
    signedInAs = null;
    const { status, body } = await get(ALICE_CHAT);
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
  });
});
