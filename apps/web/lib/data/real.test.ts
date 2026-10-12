// @vitest-environment node
import { projects } from "@askwell/db";
import { PLAN_LIMITS, WIDGET_DEFAULTS } from "@askwell/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, seedProject, type TestDb } from "../widget-config/test-db";
import { getAccountPlan } from "./billing";
import { getStoredWidgetConfig, getWidgetConfig } from "./config";
import { addOneMonth, getProjectUsage } from "./usage";

vi.mock("server-only", () => ({}));

let db: TestDb;
let close: () => Promise<void>;
let freeProject: { id: string; ownerId: string };
let proProject: { id: string; ownerId: string };

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  freeProject = await seedProject(db, { plan: "free", publicKey: "pk_free" });
  proProject = await seedProject(db, {
    plan: "pro",
    publicKey: "pk_pro",
    config: { buttonColor: "#ff0000", position: "top-left", animation: "slide", showBadge: false },
  });
  await db
    .update(projects)
    .set({ messagesUsed: 42, periodStart: new Date("2026-01-31T00:00:00.000Z") })
    .where(eq(projects.id, freeProject.id));
});

afterAll(() => close());

describe("getAccountPlan", () => {
  it("reads the plan from the database, defaulting to free", async () => {
    expect(await getAccountPlan(proProject.ownerId, db)).toBe("pro");
    expect(await getAccountPlan("user_missing", db)).toBe("free");
  });
});

describe("getProjectUsage", () => {
  it("returns real usage against the owner's plan limit", async () => {
    const usage = await getProjectUsage(freeProject.ownerId, freeProject.id, db);
    expect(usage).toMatchObject({
      plan: "free",
      messagesUsed: 42,
      messagesLimit: PLAN_LIMITS.free.messagesPerMonth,
      periodStart: "2026-01-31T00:00:00.000Z",
      resetsAt: "2026-02-28T00:00:00.000Z",
    });
  });

  it("returns null for another owner's project", async () => {
    expect(await getProjectUsage(proProject.ownerId, freeProject.id, db)).toBeNull();
  });
});

describe("widget config reads", () => {
  it("applies the plan to the stored config", async () => {
    const pro = await getWidgetConfig(proProject.ownerId, proProject.id, db);
    expect(pro?.config).toMatchObject({ buttonColor: "#ff0000", position: "top-left", showBadge: false });

    const free = await getWidgetConfig(freeProject.ownerId, freeProject.id, db);
    expect(free?.config).toEqual({ ...WIDGET_DEFAULTS, showBadge: true });
  });

  it("returns nothing for another owner's project", async () => {
    expect(await getWidgetConfig(freeProject.ownerId, proProject.id, db)).toBeNull();
    expect(await getStoredWidgetConfig(freeProject.ownerId, proProject.id, db)).toBeNull();
  });
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
