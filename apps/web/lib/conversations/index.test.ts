// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { argsOf, callsTo, fakeSupabase } from "../supabase/fake";

// Each read gets a fake owner client. Which rows RLS returns is tested against the real
// migrations on pglite (packages/db); here, a row RLS hides is simply a row the fake doesn't return.
vi.mock("server-only", () => ({}));
vi.mock("../supabase/owner", () => ({
  createOwnerClient: () => {
    throw new Error("real owner client used in a test");
  },
}));

const { getConversationById, listProjectConversations } = await import("./index");

const PROJECT_ID = "11111111-2222-4333-8444-555555555555";
const CONVERSATION_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";

/** One page of rows, then the empty page that ends fetchAll's paging. */
const paged = (rows: unknown[]) => [{ data: rows }, { data: [] }];

const summaryRow = (id: string, createdAt: string, count: number, preview: string[]) => ({
  id,
  visitor_id: "visitor_1",
  created_at: createdAt,
  message_count: [{ count }],
  preview: preview.map((body) => ({ body })),
});

describe("listProjectConversations", () => {
  it("returns nothing for a project with no conversations", async () => {
    expect(await listProjectConversations(PROJECT_ID, fakeSupabase({ from: { conversations: paged([]) } }))).toEqual([]);
  });

  it("summarizes message count and the first visitor message as the preview", async () => {
    const client = fakeSupabase({
      from: { conversations: paged([summaryRow("c1", "2026-01-01T00:00:00+00:00", 3, ["First question"])]) },
    });

    expect(await listProjectConversations(PROJECT_ID, client)).toEqual([
      { id: "c1", visitorId: "visitor_1", messageCount: 3, preview: "First question", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);

    // The preview embed is narrowed to the earliest visitor message.
    const [call] = callsTo(client, "conversations");
    expect(call?.ops).toContainEqual(["eq", "preview.role", "visitor"]);
    expect(call?.ops).toContainEqual(["order", "created_at", { referencedTable: "preview", ascending: true }]);
    expect(call?.ops).toContainEqual(["limit", 1, { referencedTable: "preview" }]);
  });

  it("returns an empty preview for a conversation with no visitor message yet", async () => {
    const client = fakeSupabase({ from: { conversations: paged([summaryRow("c1", "2026-01-01T00:00:00+00:00", 1, [])]) } });

    const [summary] = await listProjectConversations(PROJECT_ID, client);

    expect(summary).toMatchObject({ messageCount: 1, preview: "" });
  });

  it("filters to the project and orders newest first, id breaking ties", async () => {
    const client = fakeSupabase({ from: { conversations: paged([]) } });

    await listProjectConversations(PROJECT_ID, client);

    const [call] = callsTo(client, "conversations");
    expect(call?.ops).toContainEqual(["eq", "project_id", PROJECT_ID]);
    const orders = call?.ops.filter(([method, , options]) => method === "order" && !(options as { referencedTable?: string }).referencedTable);
    expect(orders).toEqual([
      ["order", "created_at", { ascending: false }],
      ["order", "id", { ascending: true }],
    ]);
  });

  it("pages until an empty page, so a busy project gets every conversation", async () => {
    const client = fakeSupabase({
      from: {
        conversations: [
          { data: [summaryRow("c2", "2026-01-02T00:00:00+00:00", 1, ["b"])] },
          { data: [summaryRow("c1", "2026-01-01T00:00:00+00:00", 1, ["a"])] },
          { data: [] },
        ],
      },
    });

    expect((await listProjectConversations(PROJECT_ID, client)).map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(callsTo(client, "conversations")).toHaveLength(3);
  });

  it("returns nothing for a malformed project ID, without querying", async () => {
    const client = fakeSupabase();
    expect(await listProjectConversations("abc", client)).toEqual([]);
    expect(client.calls).toEqual([]);
  });
});

describe("getConversationById", () => {
  const conversation = { id: CONVERSATION_ID, project_id: PROJECT_ID, visitor_id: "visitor_1", created_at: "2026-01-01T00:00:00+00:00" };

  it("returns the conversation with messages in chronological order", async () => {
    const client = fakeSupabase({
      from: {
        conversations: { data: conversation },
        messages: paged([
          { id: "m1", role: "visitor", body: "Hi", created_at: "2026-01-01T00:00:00+00:00" },
          { id: "m2", role: "bot", body: "Hello", created_at: "2026-01-01T00:00:01+00:00" },
        ]),
      },
    });

    const result = await getConversationById(CONVERSATION_ID, client);

    expect(result).toEqual({
      ...conversation,
      messages: [
        { id: "m1", role: "visitor", body: "Hi", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "m2", role: "bot", body: "Hello", createdAt: "2026-01-01T00:00:01.000Z" },
      ],
    });
    const [messagesCall] = callsTo(client, "messages");
    expect(argsOf(messagesCall, "eq")).toEqual(["conversation_id", CONVERSATION_ID]);
    expect(argsOf(messagesCall, "order")).toEqual(["created_at", { ascending: true }]);
  });

  it("returns null when RLS hides the conversation, without reading messages", async () => {
    const client = fakeSupabase();
    expect(await getConversationById(CONVERSATION_ID, client)).toBeNull();
    expect(callsTo(client, "messages")).toEqual([]);
  });

  it("returns null for a malformed id, without querying", async () => {
    const client = fakeSupabase();
    expect(await getConversationById("not-a-uuid", client)).toBeNull();
    expect(client.calls).toEqual([]);
  });

  it("throws a query error instead of reading it as missing", async () => {
    const client = fakeSupabase({ from: { conversations: { error: { code: "42501", message: "denied" } } } });
    await expect(getConversationById(CONVERSATION_ID, client)).rejects.toMatchObject({ code: "42501" });
  });
});
