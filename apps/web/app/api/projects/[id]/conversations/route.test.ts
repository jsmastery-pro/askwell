import { CONVERSATIONS_PAGE_SIZE, encodeConversationCursor, type Conversation, type Project } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeConversations,
  PUBLISHABLE_KEY,
  SECRET_KEY,
  SUPABASE_URL,
  tokenFor,
  type FakeConversations,
} from "../../../../../lib/conversations/fake-conversations";

// Real route → lib/conversations → owner client → supabase-js; only Clerk's
// auth() and the network (a fake PostgREST with the migration's RLS) are faked.
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

const ALICE = "user_alice";
const BOB = "user_bob";
const ALICES = "00000000-0000-4000-8000-00000000000a";
const BOBS = "00000000-0000-4000-8000-00000000000b";
let db: FakeConversations;

const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** Uniform ISO times, `n` seconds after a base: string order is time order. */
const at = (n: number) => new Date(Date.parse("2026-11-04T10:00:00Z") + n * 1000).toISOString();

function project(id: string, owner: string): Project {
  const p: Project = {
    id,
    owner_id: owner,
    name: id.slice(-1),
    public_key: `pk_${id.slice(-6)}`,
    messages_used: 0,
    period_start: "2026-11-01T00:00:00+00:00",
    created_at: "2026-11-03T12:00:00.000Z",
  };
  db.projects.push(p);
  return p;
}

let seq = 0;
function conversation(projectId: string, createdAt: string, id = uuid(++seq)): Conversation {
  const c = { id, project_id: projectId, visitor_id: `v_${id.slice(-4)}`, created_at: createdAt };
  db.conversations.push(c);
  return c;
}

let mseq = 0;
function message(conversationId: string, role: "visitor" | "bot", body: string, createdAt: string) {
  db.messages.push({ id: uuid(100_000 + ++mseq), conversation_id: conversationId, role, body, created_at: createdAt });
}

async function get(projectId: string, query = "") {
  const res = await GET(new Request(`http://localhost/api/projects/${projectId}/conversations${query}`), {
    params: Promise.resolve({ id: projectId }),
  } as never);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  db = createFakeConversations();
  vi.stubGlobal("fetch", db.fetch);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubEnv(["SUPABASE", "SECRET", "KEY"].join("_"), SECRET_KEY);
  project(ALICES, ALICE);
  project(BOBS, BOB);
  signedInAs = ALICE;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/projects/:id/conversations", () => {
  it("lists the project's conversations newest first, with preview and message_count, and no next page", async () => {
    const old = conversation(ALICES, at(1));
    message(old.id, "visitor", "Do you ship to Canada?", at(2));
    message(old.id, "bot", "Yes, worldwide.", at(3));
    message(old.id, "visitor", "Thanks!", at(4));
    const empty = conversation(ALICES, at(10));
    const recent = conversation(ALICES, at(20));
    message(recent.id, "visitor", "Refund policy?", at(21));
    conversation(BOBS, at(30)); // another owner's: never listed

    const { status, body } = await get(ALICES);
    expect(status).toBe(200);
    expect(body).toEqual({
      conversations: [
        { ...recent, preview: "Refund policy?", message_count: 1 },
        { ...empty, preview: null, message_count: 0 },
        { ...old, preview: "Do you ship to Canada?", message_count: 3 },
      ],
      nextCursor: null,
    });
  });

  it("reads only through the owner client (RLS), never the service key", async () => {
    message(conversation(ALICES, at(1)).id, "visitor", "Hi", at(2));
    await get(ALICES);
    expect(db.reads.map((r) => r.table)).toEqual(["conversations", "messages"]);
    expect(db.reads.every((r) => r.caller.kind === "owner")).toBe(true);
    expect(db.requests.every((r) => r.caller.kind === "owner")).toBe(true);
  });

  it("messages for the whole page come from one .in() query", async () => {
    for (let i = 0; i < 3; i++) message(conversation(ALICES, at(i * 10)).id, "visitor", `q${i}`, at(i * 10 + 1));
    await get(ALICES);
    const messageReads = db.reads.filter((r) => r.table === "messages");
    expect(messageReads).toHaveLength(1);
    expect(messageReads[0]?.search.get("conversation_id")).toMatch(/^in\.\(/);
  });

  it(`exactly ${CONVERSATIONS_PAGE_SIZE} conversations: one full page, nextCursor null`, async () => {
    for (let i = 0; i < CONVERSATIONS_PAGE_SIZE; i++) conversation(ALICES, at(i));
    const { body } = await get(ALICES);
    expect(body.conversations).toHaveLength(CONVERSATIONS_PAGE_SIZE);
    expect(body.nextCursor).toBeNull();
  });

  it(`${CONVERSATIONS_PAGE_SIZE + 1} conversations: a full page and a cursor, then the last one`, async () => {
    for (let i = 0; i < CONVERSATIONS_PAGE_SIZE + 1; i++) conversation(ALICES, at(i));
    const first = await get(ALICES);
    expect(first.body.conversations).toHaveLength(CONVERSATIONS_PAGE_SIZE);
    const last = first.body.conversations.at(-1);
    expect(first.body.nextCursor).toBe(encodeConversationCursor(last));

    const second = await get(ALICES, `?before=${first.body.nextCursor}`);
    expect(second.status).toBe(200);
    expect(second.body.conversations.map((c: Conversation) => c.created_at)).toEqual([at(0)]);
    expect(second.body.nextCursor).toBeNull();
  });

  it("pages through 130 conversations, with ties on created_at, with no repeats and no gaps", async () => {
    // Groups of 3 share a created_at; a page boundary falls inside a group.
    const all = Array.from({ length: 130 }, (_, i) => conversation(ALICES, at(Math.floor(i / 3))));
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const { status, body } = await get(ALICES, cursor ? `?before=${cursor}` : "");
      expect(status).toBe(200);
      seen.push(...body.conversations.map((c: Conversation) => c.id));
      cursor = body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    const expected = [...all]
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
      .map((c) => c.id);
    expect(seen).toEqual(expected);
  });

  it("counts every message even past PostgREST's max-rows (pages the .in() query)", async () => {
    db.settings.maxRows = 7;
    const ids = [conversation(ALICES, at(0)).id, conversation(ALICES, at(100)).id];
    for (const id of ids) {
      message(id, "bot", "(never first, but must not be the preview)", at(1));
      for (let i = 0; i < 9; i++) message(id, "visitor", `m${i}`, at(10 + i));
    }
    const { body } = await get(ALICES);
    expect(body.conversations.map((c: { message_count: number; preview: string }) => [c.message_count, c.preview])).toEqual([
      [10, "m0"],
      [10, "m0"],
    ]);
  });

  it.each([
    ["garbage", "?before=not-a-cursor!"],
    ["a non-JSON cursor", "?before=68656c6c6f"],
    ["an empty cursor", "?before="],
    ["a repeated cursor", `?before=${"x"}&before=${"y"}`],
    ["an unknown parameter", "?page=2"],
  ])("%s → 400 validation_failed, nothing read", async (_label, query) => {
    const { status, body } = await get(ALICES, query);
    expect(status).toBe(400);
    expect(body.error.code).toBe("validation_failed");
    expect(db.reads).toHaveLength(0);
  });

  it("another owner's project → 404 not_found, and no conversation is read", async () => {
    conversation(BOBS, at(1));
    const { status, body } = await get(BOBS);
    expect(status).toBe(404);
    expect(body).toEqual({ error: { code: "not_found", message: "Project not found." } });
    expect(db.reads).toHaveLength(0);
  });

  it("an unknown project → 404; a non-uuid id → 400", async () => {
    expect((await get("00000000-0000-4000-8000-999999999999")).status).toBe(404);
    expect((await get("nope")).status).toBe(400);
  });

  it("signed out → 401 unauthorized", async () => {
    signedInAs = null;
    const { status, body } = await get(ALICES);
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(db.reads).toHaveLength(0);
  });

  it("a read error → 500 internal, with nothing about the cause", async () => {
    conversation(ALICES, at(1));
    const fake = db.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("/rest/v1/messages")
        ? new Response(JSON.stringify({ code: "XX000", message: "boom" }), { status: 500 })
        : fake(input, init),
    );
    const { status, body } = await get(ALICES);
    expect(status).toBe(500);
    expect(body).toEqual({ error: { code: "internal", message: "Something went wrong. Try again." } });
  });
});
