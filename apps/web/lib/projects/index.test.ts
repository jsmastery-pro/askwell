// @vitest-environment node
import { accounts, projects, widgetConfigs } from "@askwell/db";
import { publicKeySchema } from "@askwell/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../widget-config/test-db";

const captureServerEvent = vi.hoisted(() => vi.fn());
vi.mock("../posthog/server", () => ({ captureServerEvent }));

const { createProject, deleteProject, generatePublicKey, listProjects, renameProject } = await import("./index");

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(() => close());

afterEach(() => {
  captureServerEvent.mockClear();
});

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

describe("PostHog events", () => {
  it("sends project_created with the project id after a successful create", async () => {
    const project = await create("user_events_project");
    expect(captureServerEvent).toHaveBeenCalledWith("user_events_project", "project_created", {
      project_id: project.id,
    });
  });

  it("sends nothing for a create refused by the plan limit", async () => {
    await create("user_events_limit");
    captureServerEvent.mockClear();
    const result = await createProject("user_events_limit", "Second", db);
    expect(result.ok).toBe(false);
    expect(captureServerEvent).not.toHaveBeenCalled();
  });

  it("sends signed_up only when the account row is actually created, not on later calls", async () => {
    await create("user_events_signup");
    expect(captureServerEvent.mock.calls.filter(([, event]) => event === "signed_up")).toEqual([
      ["user_events_signup", "signed_up"],
    ]);

    captureServerEvent.mockClear();
    await db.update(accounts).set({ plan: "pro" }).where(eq(accounts.clerkUserId, "user_events_signup"));
    await create("user_events_signup", "Another");
    expect(captureServerEvent.mock.calls.some(([, event]) => event === "signed_up")).toBe(false);
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
