// @vitest-environment node
import { projects } from "@askwell/db";
import { PLAN_LIMITS } from "@askwell/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mockMessagesOn } from "../mock/analytics";
import { MOCK_OTHER_PROJECT_THREAD, MOCK_THREADS } from "../mock/conversations";
import { createTestDb, seedProject, type TestDb } from "../widget-config/test-db";
import { getDashboard, parseRange, RANGES } from "./analytics";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-10-13T12:00:00.000Z");
let db: TestDb;
let close: () => Promise<void>;
let owner: string;
let older: { id: string };
let newer: { id: string };
let other: { id: string; ownerId: string };

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const first = await seedProject(db, { plan: "pro", publicKey: "pk_owner_a" });
  owner = first.ownerId;
  await db.update(projects).set({ createdAt: new Date("2026-06-01T00:00:00.000Z"), messagesUsed: 300 }).where(eq(projects.id, first.id));
  const [second] = await db
    .insert(projects)
    .values({ ownerId: owner, name: "Second", publicKey: "pk_owner_a2", createdAt: new Date("2026-10-01T00:00:00.000Z") })
    .returning();
  older = first;
  newer = second!;
  other = await seedProject(db, { plan: "free", publicKey: "pk_owner_b" });
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

  it("has one day per day in the range, ending today, plus the previous period's totals", async () => {
    for (const [range, days] of [["7d", 7], ["30d", 30], ["90d", 90]] as const) {
      const data = await getDashboard(owner, range, NOW, db);
      expect(data.daily).toHaveLength(days);
      expect(data.daily.at(-1)!.day).toBe("2026-10-13");
      expect(data.current.messages).toBe(data.daily.reduce((sum, d) => sum + d.messages, 0));
      expect(data.previous.messages).toBeGreaterThan(0);
    }
  });

  it("is stable between renders", async () => {
    expect((await getDashboard(owner, "30d", NOW, db)).daily).toEqual((await getDashboard(owner, "30d", NOW, db)).daily);
  });

  it("gives a project no activity before the day after it was created", async () => {
    const { daily } = await getDashboard(owner, "30d", NOW, db);
    const on = (day: string) => daily.find((d) => d.day === day)!.messages;
    // The newer project was created on Oct 1: only the older one counts that day; both from Oct 2.
    const limit = PLAN_LIMITS.pro.messagesPerMonth;
    expect(on("2026-10-01")).toBe(mockMessagesOn(older.id, "2026-10-01", limit));
    expect(on("2026-10-02")).toBe(mockMessagesOn(older.id, "2026-10-02", limit) + mockMessagesOn(newer.id, "2026-10-02", limit));

    const fresh = await seedProject(db, { plan: "free", publicKey: "pk_fresh" });
    const empty = await getDashboard(fresh.ownerId, "30d", new Date(fresh.createdAt.getTime() + 60_000), db);
    expect(empty.current).toEqual({ messages: 0, conversations: 0, visitors: 0 });
    expect(empty.daily.every((d) => d.messages === 0)).toBe(true);
    expect(empty.recentChats).toEqual([]);
  });

  it("shows recent chats only from the owner's own projects, newest first, at most 5", async () => {
    const { recentChats } = await getDashboard(owner, "30d", NOW, db);
    expect(recentChats.length).toBeGreaterThan(0);
    expect(recentChats.length).toBeLessThanOrEqual(5);
    for (const chat of recentChats) {
      expect([older.id, newer.id]).toContain(chat.projectId);
      expect(MOCK_THREADS.map((t) => t.id)).toContain(chat.conversationId);
      expect(chat.conversationId).not.toBe(MOCK_OTHER_PROJECT_THREAD.id);
    }
    const times = recentChats.map((c) => Date.parse(c.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("never returns another owner's project", async () => {
    const data = await getDashboard(owner, "90d", NOW, db);
    const ids = [...data.usage.map((u) => u.id), ...data.recentChats.map((c) => c.projectId)];
    expect(ids).not.toContain(other.id);

    const theirs = await getDashboard(other.ownerId, "90d", NOW, db);
    expect(theirs.usage.map((u) => u.id)).toEqual([other.id]);
    expect(theirs.recentChats.every((c) => c.projectId === other.id)).toBe(true);
  });

  it("keeps demo volume in proportion to the plan's monthly limit", async () => {
    const pro = await getDashboard(owner, "30d", NOW, db);
    const perProject = pro.current.messages / 2;
    expect(perProject).toBeGreaterThan(PLAN_LIMITS.pro.messagesPerMonth * 0.3);
    expect(perProject).toBeLessThan(PLAN_LIMITS.pro.messagesPerMonth);

    await db.update(projects).set({ createdAt: new Date("2026-06-01T00:00:00.000Z") }).where(eq(projects.id, other.id));
    const free = await getDashboard(other.ownerId, "30d", NOW, db);
    expect(free.current.messages).toBeGreaterThan(PLAN_LIMITS.free.messagesPerMonth * 0.3);
    expect(free.current.messages).toBeLessThan(PLAN_LIMITS.free.messagesPerMonth);
  });

  it("moves recent chats with now: the newest an hour ago, a week later too", async () => {
    for (const now of [NOW, new Date(NOW.getTime() + 7 * 86_400_000)]) {
      const { recentChats } = await getDashboard(owner, "30d", now, db);
      expect(Date.parse(recentChats[0]!.createdAt)).toBe(now.getTime() - 3_600_000);
    }
  });

  it("gives a project created yesterday its chats from today, but none before", async () => {
    const fresh = await seedProject(db, { plan: "pro", publicKey: "pk_yesterday" });
    const created = new Date(NOW.getTime() - 86_400_000);
    await db.update(projects).set({ createdAt: created }).where(eq(projects.id, fresh.id));
    const { recentChats } = await getDashboard(fresh.ownerId, "30d", NOW, db);
    expect(recentChats.length).toBeGreaterThan(0);
    expect(recentChats.every((chat) => chat.createdAt.slice(0, 10) > created.toISOString().slice(0, 10))).toBe(true);
  });

  it("returns an empty dashboard for an owner with no projects", async () => {
    const data = await getDashboard("user_nobody", "30d", NOW, db);
    expect(data).toMatchObject({ plan: "free", projectCount: 0, usage: [], recentChats: [] });
    expect(data.current.messages).toBe(0);
  });
});
