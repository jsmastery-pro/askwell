// @vitest-environment node
import { getConversationResponseSchema, listConversationsResponseSchema } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "../supabase/fake";

// Each read gets a fake owner client. Which rows RLS returns is tested against the real
// migrations on pglite (packages/db); here, a row RLS hides is simply a row the fake doesn't return.
vi.mock("server-only", () => ({}));
vi.mock("../supabase/owner", () => ({
  createOwnerClient: () => {
    throw new Error("real owner client used in a test");
  },
}));

const { getConversation, listConversations } = await import("./conversations");

const PROJECT_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_PROJECT_ID = "11111111-2222-4333-8444-666666666666";
const THREAD_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";

const paged = (rows: unknown[]) => [{ data: rows }, { data: [] }];

describe("listConversations", () => {
  it("lists newest first and matches the shared schema", async () => {
    const client = fakeSupabase({
      from: {
        conversations: paged([
          { id: THREAD_ID, visitor_id: "v", created_at: "2026-01-02T00:00:00+00:00", message_count: [{ count: 2 }], preview: [{ body: "Hi there" }] },
          { id: "66666666-7777-4888-8999-bbbbbbbbbbbb", visitor_id: "v", created_at: "2026-01-01T00:00:00+00:00", message_count: [{ count: 0 }], preview: [] },
        ]),
      },
    });

    const result = await listConversations(PROJECT_ID, client);

    listConversationsResponseSchema.parse({ conversations: result });
    expect(result.map((c) => c.preview)).toEqual(["Hi there", ""]);
  });

  it("returns nothing for a malformed project ID, without querying", async () => {
    const client = fakeSupabase();
    expect(await listConversations("abc", client)).toEqual([]);
    expect(client.calls).toEqual([]);
  });
});

describe("getConversation", () => {
  const client = (projectId: string | null) =>
    fakeSupabase({
      from: {
        conversations: { data: projectId && { id: THREAD_ID, project_id: projectId, visitor_id: "v", created_at: "2026-01-01T00:00:00+00:00" } },
        messages: paged([
          { id: "77777777-8888-4999-8aaa-000000000001", role: "visitor", body: "Hi there", created_at: "2026-01-01T00:00:00+00:00" },
          { id: "77777777-8888-4999-8aaa-000000000002", role: "bot", body: "Hello!", created_at: "2026-01-01T00:00:01+00:00" },
        ]),
      },
    });

  it("returns this project's thread", async () => {
    const thread = await getConversation(PROJECT_ID, THREAD_ID, client(PROJECT_ID));

    getConversationResponseSchema.parse({ conversation: thread });
    expect(thread).toMatchObject({ id: THREAD_ID, visitorId: "v", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(thread?.messages.map((m) => m.body)).toEqual(["Hi there", "Hello!"]);
  });

  it("returns null for another project's conversation, even one the owner can see", async () => {
    expect(await getConversation(PROJECT_ID, THREAD_ID, client(OTHER_PROJECT_ID))).toBeNull();
  });

  it("returns null when RLS hides the conversation", async () => {
    expect(await getConversation(PROJECT_ID, THREAD_ID, client(null))).toBeNull();
  });

  it("returns null for a malformed project or conversation ID, without querying", async () => {
    const fake = client(PROJECT_ID);
    expect(await getConversation(PROJECT_ID, "abc", fake)).toBeNull();
    expect(await getConversation("abc", THREAD_ID, fake)).toBeNull();
    expect(fake.calls).toEqual([]);
  });
});
