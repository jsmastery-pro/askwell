// @vitest-environment node
import { projects } from "@askwell/db";
import { PLAN_LIMITS } from "@askwell/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { listProjectUsage } from "../../../lib/data/usage";
import { createTestDb, seedProject, type TestDb } from "../../../lib/widget-config/test-db";

vi.mock("server-only", () => ({}));

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(() => close());

describe("listProjectUsage", () => {
  it("lists only the owner's projects, oldest first, with real counts and reset dates", async () => {
    const first = await seedProject(db, { plan: "pro", publicKey: "pk_a" });
    const [second] = await db
      .insert(projects)
      .values({ ownerId: first.ownerId, name: "Second", publicKey: "pk_a2", createdAt: new Date(first.createdAt.getTime() + 1000) })
      .returning();
    await db
      .update(projects)
      .set({ messagesUsed: 1700, periodStart: new Date("2026-01-31T00:00:00.000Z") })
      .where(eq(projects.id, first.id));
    await seedProject(db, { plan: "free", publicKey: "pk_other" });

    const rows = await listProjectUsage(first.ownerId, db);

    expect(rows.map((r) => r.id)).toEqual([first.id, second!.id]);
    expect(rows[0]).toEqual({
      id: first.id,
      name: first.name,
      plan: "pro",
      messagesUsed: 1700,
      messagesLimit: PLAN_LIMITS.pro.messagesPerMonth,
      periodStart: "2026-01-31T00:00:00.000Z",
      resetsAt: "2026-02-28T00:00:00.000Z",
    });
  });

  it("returns nothing for an owner with no projects", async () => {
    expect(await listProjectUsage("user_nobody", db)).toEqual([]);
  });
});
