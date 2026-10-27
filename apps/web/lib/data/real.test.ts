// @vitest-environment node
import { PLAN_LIMITS, WIDGET_DEFAULTS } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { argsOf, callsTo, fakeSupabase } from "../supabase/fake";
import { getAccountPlan } from "./billing";
import { getStoredWidgetConfig, getWidgetConfig } from "./config";
import { countKnowledgeSources, listKnowledgeSources } from "./knowledge";
import { addOneMonth, getProjectUsage, listProjectUsage } from "./usage";

// Each read gets a fake owner client. Which rows RLS returns is tested against the real
// migrations on pglite (packages/db); here, a row RLS hides is simply a row the fake doesn't return.
vi.mock("server-only", () => ({}));
// No read here may reach for a real client: every one is passed the fake.
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

const PROJECT_ID = "11111111-2222-4333-8444-555555555555";

const PRO_STORED_ROW = {
  button_color: "#ff0000",
  position: "top-left",
  label: "Help",
  animation: "slide",
  header_text: "Ask us",
  show_badge: false,
};

describe("getAccountPlan", () => {
  it("reads the plan from the signed-in owner's account", async () => {
    expect(await getAccountPlan(fakeSupabase({ from: { accounts: { data: { plan: "pro" } } } }))).toBe("pro");
  });

  it("defaults to free when the owner has no account row yet", async () => {
    expect(await getAccountPlan(fakeSupabase())).toBe("free");
  });
});

describe("getProjectUsage", () => {
  it("returns real usage against the owner's plan limit", async () => {
    const client = fakeSupabase({
      from: {
        projects: {
          data: { id: PROJECT_ID, name: "Docs", messages_used: 42, period_start: "2026-01-31T00:00:00+00:00", account: { plan: "free" } },
        },
      },
    });

    expect(await getProjectUsage(PROJECT_ID, client)).toEqual({
      plan: "free",
      messagesUsed: 42,
      messagesLimit: PLAN_LIMITS.free.messagesPerMonth,
      periodStart: "2026-01-31T00:00:00.000Z",
      resetsAt: "2026-02-28T00:00:00.000Z",
    });
    expect(argsOf(callsTo(client, "projects")[0], "eq")).toEqual(["id", PROJECT_ID]);
  });

  it("returns null when RLS hides the project", async () => {
    expect(await getProjectUsage(PROJECT_ID, fakeSupabase())).toBeNull();
  });

  it("lists every project's usage, oldest first", async () => {
    const client = fakeSupabase({
      from: {
        projects: {
          data: [
            { id: "a", name: "A", messages_used: 1, period_start: "2026-03-15T12:30:00+00:00", account: { plan: "pro" } },
            { id: "b", name: "B", messages_used: 2, period_start: "2026-03-15T12:30:00+00:00", account: null },
          ],
        },
      },
    });

    const rows = await listProjectUsage(client);

    expect(rows.map((r) => [r.id, r.plan, r.messagesLimit])).toEqual([
      ["a", "pro", PLAN_LIMITS.pro.messagesPerMonth],
      ["b", "free", PLAN_LIMITS.free.messagesPerMonth],
    ]);
    expect(argsOf(callsTo(client, "projects")[0], "order")).toEqual(["created_at", { ascending: true }]);
  });
});

describe("widget config reads", () => {
  const client = (plan: "free" | "pro", project: unknown = { id: PROJECT_ID }) =>
    fakeSupabase({
      from: {
        projects: { data: project },
        accounts: { data: { plan } },
        widget_configs: { data: PRO_STORED_ROW },
      },
    });

  it("maps the stored row to the API's field names", async () => {
    expect(await getStoredWidgetConfig(PROJECT_ID, client("pro"))).toEqual({
      buttonColor: "#ff0000",
      position: "top-left",
      label: "Help",
      animation: "slide",
      headerText: "Ask us",
      showBadge: false,
    });
  });

  it("applies the plan to the stored config", async () => {
    const pro = await getWidgetConfig(PROJECT_ID, client("pro"));
    expect(pro?.config).toMatchObject({ buttonColor: "#ff0000", position: "top-left", showBadge: false });

    const free = await getWidgetConfig(PROJECT_ID, client("free"));
    expect(free?.config).toEqual({ ...WIDGET_DEFAULTS, showBadge: true });
  });

  it("returns nothing when RLS hides the project", async () => {
    expect(await getWidgetConfig(PROJECT_ID, client("pro", null))).toBeNull();
    expect(await getStoredWidgetConfig(PROJECT_ID, fakeSupabase())).toBeNull();
  });
});

describe("knowledge reads", () => {
  const rows = [
    { id: "s3", title: "Notes.md", type: "md", status: "processing", created_at: "2026-10-03T00:00:00+00:00" },
    { id: "s2", title: "Handbook.pdf", type: "pdf", status: "ready", created_at: "2026-10-02T00:00:00+00:00" },
    { id: "s1", title: "Pasted FAQ", type: "text", status: "failed", created_at: "2026-10-01T00:00:00+00:00" },
  ];

  it("lists a project's sources newest first, statuses as stored", async () => {
    const client = fakeSupabase({ from: { knowledge_sources: { data: rows } } });

    const sources = await listKnowledgeSources(PROJECT_ID, client);

    expect(sources).toEqual([
      { id: "s3", title: "Notes.md", type: "md", status: "processing", createdAt: "2026-10-03T00:00:00.000Z" },
      { id: "s2", title: "Handbook.pdf", type: "pdf", status: "ready", createdAt: "2026-10-02T00:00:00.000Z" },
      { id: "s1", title: "Pasted FAQ", type: "text", status: "failed", createdAt: "2026-10-01T00:00:00.000Z" },
    ]);
    const [call] = callsTo(client, "knowledge_sources");
    expect(argsOf(call, "eq")).toEqual(["project_id", PROJECT_ID]);
    expect(argsOf(call, "order")).toEqual(["created_at", { ascending: false }]);
  });

  it("counts every source toward the limit, with no status filter", async () => {
    const client = fakeSupabase({ from: { knowledge_sources: { count: 3 } } });

    expect(await countKnowledgeSources(PROJECT_ID, client)).toBe(3);
    const [call] = callsTo(client, "knowledge_sources");
    expect(call?.ops.map(([method]) => method)).toEqual(["select", "eq"]);
  });

  it("returns nothing when RLS hides the project's sources", async () => {
    expect(await listKnowledgeSources(PROJECT_ID, fakeSupabase())).toEqual([]);
    expect(await countKnowledgeSources(PROJECT_ID, fakeSupabase({ from: { knowledge_sources: { count: 0 } } }))).toBe(0);
  });

  it("throws a query error instead of reading it as empty", async () => {
    const client = fakeSupabase({ from: { knowledge_sources: { error: { code: "42501", message: "denied" } } } });
    await expect(listKnowledgeSources(PROJECT_ID, client)).rejects.toMatchObject({ code: "42501" });
    await expect(countKnowledgeSources(PROJECT_ID, client)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("malformed project IDs", () => {
  it.each(["abc", "1", "not-a-uuid-at-all", "11111111-2222-4333-8444-55555555555z"])(
    "%s returns null without querying",
    async (id) => {
      const client = fakeSupabase();
      expect(await getProjectUsage(id, client)).toBeNull();
      expect(await getWidgetConfig(id, client)).toBeNull();
      expect(await getStoredWidgetConfig(id, client)).toBeNull();
      expect(await listKnowledgeSources(id, client)).toEqual([]);
      expect(await countKnowledgeSources(id, client)).toBe(0);
      expect(client.calls).toEqual([]);
    },
  );
});

describe("addOneMonth", () => {
  it.each([
    ["2026-01-31T00:00:00.000Z", "2026-02-28T00:00:00.000Z"],
    ["2028-01-31T00:00:00.000Z", "2028-02-29T00:00:00.000Z"],
    ["2026-03-15T12:30:00.000Z", "2026-04-15T12:30:00.000Z"],
    ["2026-12-31T00:00:00.000Z", "2027-01-31T00:00:00.000Z"],
  ])("%s → %s", (from, to) => {
    expect(addOneMonth(new Date(from)).toISOString()).toBe(to);
  });
});
