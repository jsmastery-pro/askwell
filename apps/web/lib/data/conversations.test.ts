// @vitest-environment node
import { accounts, conversations, messages, projects } from "@askwell/db";
import { getConversationResponseSchema, listConversationsResponseSchema } from "@askwell/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../widget-config/test-db";

vi.mock("server-only", () => ({}));

const { getConversation, listConversations } = await import("./conversations");

let db: TestDb;
let close: () => Promise<void>;
let projectId: string;
let otherProjectId: string;
let threadId: string;
let otherThreadId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(accounts).values({ clerkUserId: "owner_1", plan: "free" });

  const [project, otherProject] = await db
    .insert(projects)
    .values([
      { ownerId: "owner_1", name: "Docs", publicKey: "pk_conv_a" },
      { ownerId: "owner_1", name: "Other", publicKey: "pk_conv_b" },
    ])
    .returning();
  projectId = project!.id;
  otherProjectId = otherProject!.id;

  const [thread, otherThread] = await db
    .insert(conversations)
    .values([
      { projectId, visitorId: "visitor_a" },
      { projectId: otherProjectId, visitorId: "visitor_b" },
    ])
    .returning();
  threadId = thread!.id;
  otherThreadId = otherThread!.id;

  await db
    .insert(messages)
    .values([
      { conversationId: threadId, role: "visitor", body: "Hi there" },
      { conversationId: threadId, role: "bot", body: "Hello!" },
      { conversationId: otherThreadId, role: "visitor", body: "Different project" },
    ]);
});

afterAll(() => close());

describe("listConversations", () => {
  it("lists newest first and matches the shared schema", async () => {
    const result = await listConversations(projectId, db);
    listConversationsResponseSchema.parse({ conversations: result });
    const times = result.map((c) => Date.parse(c.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(result).toHaveLength(1);
  });

  it("never includes another project's conversation", async () => {
    expect((await listConversations(projectId, db)).map((c) => c.id)).not.toContain(otherThreadId);
    expect((await listConversations(otherProjectId, db)).map((c) => c.id)).toEqual([otherThreadId]);
  });

  it("returns nothing for a malformed project ID", async () => {
    expect(await listConversations("abc", db)).toEqual([]);
  });
});

describe("getConversation", () => {
  it("returns this project's thread", async () => {
    const thread = await getConversation(projectId, threadId, db);
    getConversationResponseSchema.parse({ conversation: thread });
    expect(thread?.messages.map((m) => m.body)).toEqual(["Hi there", "Hello!"]);
  });

  it("returns null for another project's, an unknown or a malformed conversation", async () => {
    expect(await getConversation(projectId, otherThreadId, db)).toBeNull();
    expect(await getConversation(projectId, "00000000-0000-4000-8000-000000000000", db)).toBeNull();
    expect(await getConversation(projectId, "abc", db)).toBeNull();
    expect(await getConversation("abc", threadId, db)).toBeNull();
  });
});
