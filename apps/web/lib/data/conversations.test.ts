import { getConversationResponseSchema, listConversationsResponseSchema } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { MOCK_OTHER_PROJECT_ID, MOCK_OTHER_PROJECT_THREAD, MOCK_THREADS } from "../mock/conversations";
import { getConversation, listConversations } from "./conversations";

vi.mock("server-only", () => ({}));

const PROJECT = "11111111-2222-4333-8444-555555555555";

describe("listConversations", () => {
  it("lists newest first and matches the shared schema", async () => {
    const conversations = await listConversations(PROJECT);
    listConversationsResponseSchema.parse({ conversations });
    const times = conversations.map((c) => Date.parse(c.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(conversations).toHaveLength(MOCK_THREADS.length);
  });

  it("never includes another project's conversation", async () => {
    const ids = (await listConversations(PROJECT)).map((c) => c.id);
    expect(ids).not.toContain(MOCK_OTHER_PROJECT_THREAD.id);
    expect((await listConversations(MOCK_OTHER_PROJECT_ID)).map((c) => c.id)).toEqual([MOCK_OTHER_PROJECT_THREAD.id]);
  });

  it("returns nothing for a malformed project ID", async () => {
    expect(await listConversations("abc")).toEqual([]);
  });
});

describe("getConversation", () => {
  it("returns this project's thread", async () => {
    const thread = await getConversation(PROJECT, MOCK_THREADS[0]!.id);
    getConversationResponseSchema.parse({ conversation: thread });
  });

  it("returns null for another project's, an unknown or a malformed conversation", async () => {
    expect(await getConversation(PROJECT, MOCK_OTHER_PROJECT_THREAD.id)).toBeNull();
    expect(await getConversation(PROJECT, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getConversation(PROJECT, "abc")).toBeNull();
    expect(await getConversation("abc", MOCK_THREADS[0]!.id)).toBeNull();
  });
});
