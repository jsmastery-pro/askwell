// @vitest-environment node
import { conversations, messages, projects } from "@askwell/db";
import { PLAN_LIMITS } from "@askwell/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, seedProject, type TestDb } from "../widget-config/test-db";
import { getDashboard, parseRange, RANGES } from "./analytics";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-10-13T12:00:00.000Z");
let db: TestDb;
let close: () => Promise<void>;
let owner: string;
let older: { id: string }; // project "Older"
let newer: { id: string }; // project "Newer"
let other: { id: string; ownerId: string };
let fresh: { id: string; ownerId: string };

async function seedConversation(
  projectId: string,
  visitorId: string,
  createdAt: string,
  messageRows: { role: "visitor" | "bot"; body: string; createdAt: string }[],
) {
  const [conversation] = await db
    .insert(conversations)
    .values({ projectId, visitorId, createdAt: new Date(createdAt) })
    .returning();
  if (messageRows.length > 0) {
    await db
      .insert(messages)
      .values(messageRows.map((m) => ({ conversationId: conversation!.id, ...m, createdAt: new Date(m.createdAt) })));
  }
  return conversation!;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());

  const first = await seedProject(db, { plan: "pro", publicKey: "pk_owner_a" });
  owner = first.ownerId;
  await db.update(projects).set({ name: "Older", messagesUsed: 300 }).where(eq(projects.id, first.id));
  const [second] = await db.insert(projects).values({ ownerId: owner, name: "Newer", publicKey: "pk_owner_a2" }).returning();
  older = first;
  newer = second!;

  // Previous period (outside the 30d range ending NOW): one conversation, one message.
  await seedConversation(older.id, "visitor_e", "2026-09-01T00:00:00.000Z", [
    { role: "visitor", body: "old", createdAt: "2026-09-01T00:00:00.000Z" },
  ]);

  // Current period: 5 conversations across both projects, 7 messages total.
  await seedConversation(older.id, "visitor_a", "2026-10-10T09:00:00.000Z", [
    { role: "visitor", body: "Hi", createdAt: "2026-10-10T09:00:00.000Z" },
    { role: "bot", body: "Hello", createdAt: "2026-10-10T09:00:05.000Z" },
    { role: "visitor", body: "More", createdAt: "2026-10-10T09:05:00.000Z" },
  ]);
  await seedConversation(newer.id, "visitor_b", "2026-10-11T08:00:00.000Z", [
    { role: "visitor", body: "Q2", createdAt: "2026-10-11T08:00:00.000Z" },
  ]);
  await seedConversation(older.id, "visitor_a", "2026-10-11T10:00:00.000Z", [
    { role: "visitor", body: "Q3", createdAt: "2026-10-11T10:00:00.000Z" },
  ]);
  await seedConversation(newer.id, "visitor_c", "2026-10-12T08:00:00.000Z", [
    { role: "visitor", body: "Q4", createdAt: "2026-10-12T08:00:00.000Z" },
  ]);
  await seedConversation(older.id, "visitor_d", "2026-10-12T09:00:00.000Z", [
    { role: "visitor", body: "Q5", createdAt: "2026-10-12T09:00:00.000Z" },
  ]);

  other = await seedProject(db, { plan: "free", publicKey: "pk_owner_b" });
  await seedConversation(other.id, "visitor_x", "2026-10-12T00:00:00.000Z", [
    { role: "visitor", body: "Other owner's question", createdAt: "2026-10-12T00:00:00.000Z" },
  ]);

  fresh = await seedProject(db, { plan: "free", publicKey: "pk_owner_fresh" });
});

afterAll(() => close());

describe("parseRange", () => {
  it("accepts only 7d, 30d and 90d, and falls back to 30d", () => {
    for (const range of RANGES) expect(parseRange(range)).toBe(range);
    for (const value of ["abc", "", "365d", "30", undefined, ["7d", "90d"], "7D"]) expect(parseRange(value)).toBe("30d");
  });
});

describe("getDashboard", () => {
  it("reads the real plan, project count and usage for this owner only", async () => {
    const data = await getDashboard(owner, "30d", NOW, db);
    expect(data.plan).toBe("pro");
    expect(data.projectCount).toBe(2);
    expect(data.projectLimit).toBe(PLAN_LIMITS.pro.projects);
    expect(data.usage.map((u) => u.id)).toEqual([older.id, newer.id]);
    expect(data.usage[0]).toMatchObject({ messagesUsed: 300, messagesLimit: PLAN_LIMITS.pro.messagesPerMonth });
  });

  it("has one day per day in the range, ending today, zero-filled", async () => {
    const { daily } = await getDashboard(owner, "30d", NOW, db);
    expect(daily).toHaveLength(30);
    expect(daily.at(-1)!.day).toBe("2026-10-13");
    expect(daily.at(0)!.day).toBe("2026-09-14");
    const on = (day: string) => daily.find((d) => d.day === day)!.messages;
    expect(on("2026-10-10")).toBe(3);
    expect(on("2026-10-11")).toBe(2);
    expect(on("2026-10-12")).toBe(2);
    expect(on("2026-10-13")).toBe(0);
    expect(daily.reduce((sum, d) => sum + d.messages, 0)).toBe(7);
  });

  it("counts real messages, distinct conversations and distinct visitors for the current period", async () => {
    const { current } = await getDashboard(owner, "30d", NOW, db);
    expect(current).toEqual({ messages: 7, conversations: 5, visitors: 4 });
  });

  it("scopes the previous period to the window immediately before, with no overlap", async () => {
    const { previous } = await getDashboard(owner, "30d", NOW, db);
    expect(previous).toEqual({ messages: 1, conversations: 1, visitors: 1 });
  });

  it("shows the 5 newest conversations, newest first, with project name and preview", async () => {
    const { recentChats } = await getDashboard(owner, "30d", NOW, db);
    expect(recentChats).toHaveLength(5);
    expect(recentChats.map((c) => c.preview)).toEqual(["Q5", "Q4", "Q3", "Q2", "Hi"]);
    expect(recentChats.map((c) => c.projectName)).toEqual(["Older", "Newer", "Older", "Newer", "Older"]);
    const times = recentChats.map((c) => Date.parse(c.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    // The 6th (oldest, previous-period) conversation doesn't make the top 5.
    expect(recentChats.some((c) => c.preview === "old")).toBe(false);
  });

  it("never returns another owner's project, activity or chats", async () => {
    const data = await getDashboard(owner, "90d", NOW, db);
    expect(data.usage.map((u) => u.id)).not.toContain(other.id);
    expect(data.recentChats.map((c) => c.projectId)).not.toContain(other.id);
    expect(data.recentChats.some((c) => c.preview === "Other owner's question")).toBe(false);

    const theirs = await getDashboard(other.ownerId, "90d", NOW, db);
    expect(theirs.usage.map((u) => u.id)).toEqual([other.id]);
    expect(theirs.recentChats).toHaveLength(1);
    expect(theirs.recentChats[0]!.preview).toBe("Other owner's question");
    expect(theirs.current).toEqual({ messages: 1, conversations: 1, visitors: 1 });
  });

  it("shows zero activity for a project with no conversations yet", async () => {
    const data = await getDashboard(fresh.ownerId, "30d", NOW, db);
    expect(data.projectCount).toBe(1);
    expect(data.current).toEqual({ messages: 0, conversations: 0, visitors: 0 });
    expect(data.previous).toEqual({ messages: 0, conversations: 0, visitors: 0 });
    expect(data.daily.every((d) => d.messages === 0)).toBe(true);
    expect(data.recentChats).toEqual([]);
  });

  it("returns an empty dashboard for an owner with no projects", async () => {
    const data = await getDashboard("user_nobody", "30d", NOW, db);
    expect(data).toMatchObject({ plan: "free", projectCount: 0, usage: [], recentChats: [] });
    expect(data.current).toEqual({ messages: 0, conversations: 0, visitors: 0 });
  });

  it("is stable between renders", async () => {
    const a = await getDashboard(owner, "30d", NOW, db);
    const b = await getDashboard(owner, "30d", NOW, db);
    expect(a).toEqual(b);
  });
});
