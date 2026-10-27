// @vitest-environment node
import { PLAN_LIMITS } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { argsOf, callsTo, fakeSupabase, type FakeCall } from "../supabase/fake";
import { getDashboard, parseRange, RANGES } from "./analytics";

// The dashboard reads through a fake owner client. owner_activity's SQL, and that RLS limits it
// (and every table) to the caller's own projects, are tested against the real migrations on
// pglite (packages/db); here the fake computes the same counts over an in-memory message list,
// so the date windows getDashboard asks for are what's checked.
vi.mock("server-only", () => ({}));
vi.mock("../supabase/owner", () => ({
  createOwnerClient: () => {
    throw new Error("real owner client used in a test");
  },
}));
vi.mock("../supabase/service", () => ({
  createServiceClient: () => {
    throw new Error("real service client used in a test");
  },
}));

const NOW = new Date("2026-10-13T12:00:00.000Z");

type SeedMessage = { conversation: string; visitor: string; at: string };

// One message before the 30d range (previous period), seven inside it across five conversations
// and four visitors.
const MESSAGES: SeedMessage[] = [
  { conversation: "c0", visitor: "visitor_e", at: "2026-09-01T00:00:00.000Z" },
  { conversation: "c1", visitor: "visitor_a", at: "2026-10-10T09:00:00.000Z" },
  { conversation: "c1", visitor: "visitor_a", at: "2026-10-10T09:00:05.000Z" },
  { conversation: "c1", visitor: "visitor_a", at: "2026-10-10T09:05:00.000Z" },
  { conversation: "c2", visitor: "visitor_b", at: "2026-10-11T08:00:00.000Z" },
  { conversation: "c3", visitor: "visitor_a", at: "2026-10-11T10:00:00.000Z" },
  { conversation: "c4", visitor: "visitor_c", at: "2026-10-12T08:00:00.000Z" },
  { conversation: "c5", visitor: "visitor_d", at: "2026-10-12T09:00:00.000Z" },
];

/** owner_activity over `messages`: totals and messages per UTC day in [p_start, p_end]. */
function ownerActivity(messages: SeedMessage[]) {
  return (call: FakeCall) => {
    const { p_start, p_end } = argsOf(call, "args")![0] as { p_start: string; p_end: string };
    const inRange = messages.filter((m) => m.at >= new Date(p_start).toISOString() && m.at <= new Date(p_end).toISOString());
    const daily: Record<string, number> = {};
    for (const m of inRange) daily[m.at.slice(0, 10)] = (daily[m.at.slice(0, 10)] ?? 0) + 1;
    return {
      data: {
        messages: inRange.length,
        conversations: new Set(inRange.map((m) => m.conversation)).size,
        visitors: new Set(inRange.map((m) => m.visitor)).size,
        daily,
      },
    };
  };
}

const project = (id: string, name: string, messagesUsed: number) => ({
  id,
  name,
  owner_id: "user_owner",
  public_key: `pk_${id}`,
  messages_used: messagesUsed,
  period_start: "2026-10-01T00:00:00+00:00",
  created_at: "2026-10-01T00:00:00+00:00",
});

const chat = (id: string, projectId: string, projectName: string, createdAt: string, preview: string) => ({
  id,
  project_id: projectId,
  created_at: createdAt,
  project: { name: projectName },
  message_count: [{ count: 1 }],
  preview: [{ body: preview }],
});

function ownerClient({
  plan = "pro",
  projects = [project("p_older", "Older", 300), project("p_newer", "Newer", 0)],
  messages = MESSAGES,
  chats = [
    chat("c5", "p_older", "Older", "2026-10-12T09:00:00+00:00", "Q5"),
    chat("c4", "p_newer", "Newer", "2026-10-12T08:00:00+00:00", "Q4"),
    chat("c3", "p_older", "Older", "2026-10-11T10:00:00+00:00", "Q3"),
    chat("c2", "p_newer", "Newer", "2026-10-11T08:00:00+00:00", "Q2"),
    chat("c1", "p_older", "Older", "2026-10-10T09:00:00+00:00", "Hi"),
  ],
}: { plan?: "free" | "pro" | null; projects?: unknown[]; messages?: SeedMessage[]; chats?: unknown[] } = {}) {
  return fakeSupabase({
    from: {
      projects: { data: projects },
      accounts: { data: plan && { plan } },
      conversations: { data: chats },
    },
    rpc: { owner_activity: ownerActivity(messages) },
  });
}

describe("parseRange", () => {
  it("accepts only 7d, 30d and 90d, and falls back to 30d", () => {
    for (const range of RANGES) expect(parseRange(range)).toBe(range);
    for (const value of ["abc", "", "365d", "30", undefined, ["7d", "90d"], "7D"]) expect(parseRange(value)).toBe("30d");
  });
});

describe("getDashboard", () => {
  it("reads the plan, project count and usage", async () => {
    const data = await getDashboard("30d", NOW, ownerClient());

    expect(data.plan).toBe("pro");
    expect(data.projectCount).toBe(2);
    expect(data.projectLimit).toBe(PLAN_LIMITS.pro.projects);
    expect(data.usage.map((u) => u.id)).toEqual(["p_older", "p_newer"]);
    expect(data.usage[0]).toMatchObject({
      messagesUsed: 300,
      messagesLimit: PLAN_LIMITS.pro.messagesPerMonth,
      periodStart: "2026-10-01T00:00:00.000Z",
      resetsAt: "2026-11-01T00:00:00.000Z",
    });
  });

  it("has one day per day in the range, ending today, zero-filled", async () => {
    const { daily } = await getDashboard("30d", NOW, ownerClient());

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

  it("asks owner_activity for the current range: the first day's UTC midnight to now", async () => {
    const client = ownerClient();
    await getDashboard("7d", NOW, client);

    const ranges = callsTo(client, "owner_activity").map((call) => argsOf(call, "args")![0]);
    expect(ranges).toContainEqual({ p_start: "2026-10-07T00:00:00.000Z", p_end: NOW.toISOString() });
  });

  it("counts messages, distinct conversations and distinct visitors for the current period", async () => {
    const { current } = await getDashboard("30d", NOW, ownerClient());
    expect(current).toEqual({ messages: 7, conversations: 5, visitors: 4 });
  });

  it("scopes the previous period to the window immediately before, with no overlap", async () => {
    const client = ownerClient();
    const { previous } = await getDashboard("30d", NOW, client);

    expect(previous).toEqual({ messages: 1, conversations: 1, visitors: 1 });
    const ranges = callsTo(client, "owner_activity").map((call) => argsOf(call, "args")![0]);
    expect(ranges).toContainEqual({ p_start: "2026-08-15T00:00:00.000Z", p_end: "2026-09-13T23:59:59.999Z" });
  });

  it("shows the 5 newest conversations, newest first, with project name and preview", async () => {
    const client = ownerClient();
    const { recentChats } = await getDashboard("30d", NOW, client);

    expect(recentChats.map((c) => c.preview)).toEqual(["Q5", "Q4", "Q3", "Q2", "Hi"]);
    expect(recentChats.map((c) => c.projectName)).toEqual(["Older", "Newer", "Older", "Newer", "Older"]);
    expect(recentChats[0]).toEqual({
      conversationId: "c5",
      projectId: "p_older",
      projectName: "Older",
      preview: "Q5",
      createdAt: "2026-10-12T09:00:00.000Z",
    });
    const [call] = callsTo(client, "conversations");
    expect(call?.ops).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(call?.ops).toContainEqual(["limit", 5]);
  });

  it("shows zero activity for a project with no conversations yet", async () => {
    const data = await getDashboard("30d", NOW, ownerClient({ projects: [project("p_fresh", "Fresh", 0)], messages: [], chats: [] }));

    expect(data.projectCount).toBe(1);
    expect(data.current).toEqual({ messages: 0, conversations: 0, visitors: 0 });
    expect(data.previous).toEqual({ messages: 0, conversations: 0, visitors: 0 });
    expect(data.daily.every((d) => d.messages === 0)).toBe(true);
    expect(data.recentChats).toEqual([]);
  });

  it("returns an empty dashboard for an owner with no projects or account yet", async () => {
    const data = await getDashboard("30d", NOW, ownerClient({ plan: null, projects: [], messages: [], chats: [] }));

    expect(data).toMatchObject({ plan: "free", projectCount: 0, projectLimit: PLAN_LIMITS.free.projects, usage: [], recentChats: [] });
    expect(data.current).toEqual({ messages: 0, conversations: 0, visitors: 0 });
  });

  it("throws when owner_activity fails, instead of showing zeros", async () => {
    const client = fakeSupabase({
      from: { projects: { data: [] } },
      rpc: { owner_activity: { error: { code: "22023", message: "activity range is over 366 days" } } },
    });
    await expect(getDashboard("30d", NOW, client)).rejects.toMatchObject({ code: "22023" });
  });

  it("is stable between renders", async () => {
    const a = await getDashboard("30d", NOW, ownerClient());
    const b = await getDashboard("30d", NOW, ownerClient());
    expect(a).toEqual(b);
  });
});
