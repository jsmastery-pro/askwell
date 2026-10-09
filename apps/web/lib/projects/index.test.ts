// @vitest-environment node
import { accounts, projects, widgetConfigs } from "@askwell/db";
import { publicKeySchema } from "@askwell/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../widget-config/test-db";
import { createProject, deleteProject, generatePublicKey, listProjects, renameProject } from "./index";

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(() => close());

async function create(ownerId: string, name = "Docs bot") {
  const result = await createProject(ownerId, name, db);
  if (!result.ok) throw new Error("expected create to succeed");
  return result.project;
}

describe("generatePublicKey", () => {
  it("is pk_ + 32 URL-safe chars and valid for the widget routes", () => {
    const key = generatePublicKey();
    expect(key).toMatch(/^pk_[A-Za-z0-9_-]{32}$/);
    expect(publicKeySchema.safeParse(key).success).toBe(true);
  });

  it("doesn't repeat", () => {
    expect(new Set(Array.from({ length: 1000 }, generatePublicKey)).size).toBe(1000);
  });
});

describe("createProject", () => {
  it("creates the account row if the owner has none yet (plan free)", async () => {
    await create("user_new");
    const [account] = await db.select().from(accounts).where(eq(accounts.clerkUserId, "user_new"));
    expect(account?.plan).toBe("free");
  });

  it("creates a default widget_configs row with the project", async () => {
    const project = await create("user_cfg");
    const [config] = await db.select().from(widgetConfigs).where(eq(widgetConfigs.projectId, project.id));
    expect(config).toMatchObject({ position: "bottom-right", animation: "fade", showBadge: true, buttonColor: null });
  });

  it("refuses a Free owner's second project", async () => {
    await create("user_free");
    expect(await createProject("user_free", "Second", db)).toEqual({ ok: false, reason: "plan_limit", limit: 1 });
    expect(await listProjects("user_free", db)).toHaveLength(1);
  });

  it("allows a Pro owner 5 projects, then refuses", async () => {
    await db.insert(accounts).values({ clerkUserId: "user_pro", plan: "pro" });
    for (let i = 0; i < 5; i++) await create("user_pro", `P${i}`);
    expect(await createProject("user_pro", "Sixth", db)).toMatchObject({ ok: false, limit: 5 });
  });

  it("lets only one of two simultaneous Free creates through", async () => {
    const results = await Promise.all([createProject("user_race", "A", db), createProject("user_race", "B", db)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await listProjects("user_race", db)).toHaveLength(1);
  });
});

describe("owner scoping", () => {
  it("lists only the owner's projects", async () => {
    const mine = await create("user_a");
    await create("user_b");
    expect((await listProjects("user_a", db)).map((p) => p.id)).toEqual([mine.id]);
  });

  it("renames only for the owner", async () => {
    const project = await create("user_rename");
    expect(await renameProject(project.id, "user_other", "Hacked", db)).toBeNull();
    expect((await renameProject(project.id, "user_rename", "New name", db))?.name).toBe("New name");
  });

  it("deletes only for the owner, and the config cascades", async () => {
    const project = await create("user_delete");
    expect(await deleteProject(project.id, "user_other", db)).toBe(false);
    expect(await deleteProject(project.id, "user_delete", db)).toBe(true);
    expect(await db.select().from(projects).where(eq(projects.id, project.id))).toHaveLength(0);
    expect(await db.select().from(widgetConfigs).where(eq(widgetConfigs.projectId, project.id))).toHaveLength(0);
  });
});
