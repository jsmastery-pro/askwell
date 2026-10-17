// @vitest-environment node
import { accounts, conversations, messages, projects } from "@askwell/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../widget-config/test-db";

vi.mock("server-only", () => ({}));

const { getConversationById, listProjectConversations } = await import("./index");

let db: TestDb;
let close: () => Promise<void>;
let projectId: string;

async function seedConversation(
  forProjectId: string,
  seedMessages: { role: "visitor" | "bot"; body: string }[] = [],
) {
  const [conversation] = await db
    .insert(conversations)
    .values({ projectId: forProjectId, visitorId: "visitor_1" })
    .returning();
  for (const [i, m] of seedMessages.entries()) {
    await db.insert(messages).values({
      conversationId: conversation!.id,
      role: m.role,
      body: m.body,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    });
  }
  return conversation!;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(accounts).values({ clerkUserId: "owner_1", plan: "free" });
  const [project] = await db
    .insert(projects)
    .values({ ownerId: "owner_1", name: "Docs", publicKey: "pk_test" })
    .returning();
  projectId = project!.id;
});

afterAll(() => close());

describe("listProjectConversations", () => {
  it("returns nothing for a project with no conversations", async () => {
    const other = (
      await db.insert(projects).values({ ownerId: "owner_1", name: "Empty", publicKey: "pk_empty" }).returning()
    )[0]!;
    expect(await listProjectConversations(other.id, db)).toEqual([]);
  });

  it("summarizes message count and the first visitor message as the preview", async () => {
    const other = (
      await db.insert(projects).values({ ownerId: "owner_1", name: "Summary", publicKey: "pk_summary" }).returning()
    )[0]!;
    const conversation = await seedConversation(other.id, [
      { role: "bot", body: "Hi! How can I help?" },
      { role: "visitor", body: "What are your hours?" },
      { role: "bot", body: "9 to 5." },
    ]);

    const [summary] = await listProjectConversations(other.id, db);
    expect(summary).toEqual({
      id: conversation.id,
      visitorId: "visitor_1",
      preview: "What are your hours?",
      messageCount: 3,
      createdAt: conversation.createdAt.toISOString(),
    });
  });

  it("returns an empty preview for a conversation with no visitor message yet", async () => {
    const other = (
      await db.insert(projects).values({ ownerId: "owner_1", name: "NoVisitor", publicKey: "pk_novisitor" }).returning()
    )[0]!;
    const [conversation] = await db.insert(conversations).values({ projectId: other.id, visitorId: "v" }).returning();
    await db.insert(messages).values({ conversationId: conversation!.id, role: "bot", body: "..." });

    const [summary] = await listProjectConversations(other.id, db);
    expect(summary?.preview).toBe("");
  });

  it("orders conversations newest first", async () => {
    const other = (
      await db.insert(projects).values({ ownerId: "owner_1", name: "Ordered", publicKey: "pk_ordered" }).returning()
    )[0]!;
    const [older, newer] = await db
      .insert(conversations)
      .values([
        { projectId: other.id, visitorId: "a", createdAt: new Date("2026-01-01T00:00:00.000Z") },
        { projectId: other.id, visitorId: "b", createdAt: new Date("2026-01-02T00:00:00.000Z") },
      ])
      .returning();

    const summaries = await listProjectConversations(other.id, db);
    expect(summaries.map((s) => s.id)).toEqual([newer!.id, older!.id]);
  });
});

describe("getConversationById", () => {
  it("returns the conversation with messages in chronological order", async () => {
    const conversation = await seedConversation(projectId, [
      { role: "visitor", body: "Hi" },
      { role: "bot", body: "Hello!" },
    ]);

    const result = await getConversationById(conversation.id, db);

    expect(result?.id).toBe(conversation.id);
    expect(result?.projectId).toBe(projectId);
    expect(result?.messages.map((m) => m.body)).toEqual(["Hi", "Hello!"]);
    expect(result?.messages.map((m) => m.role)).toEqual(["visitor", "bot"]);
  });

  it("returns null for an unknown or malformed id", async () => {
    expect(await getConversationById("00000000-0000-4000-8000-000000000000", db)).toBeNull();
    expect(await getConversationById("not-a-uuid", db)).toBeNull();
  });
});
