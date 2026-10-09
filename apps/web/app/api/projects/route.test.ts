// @vitest-environment node
import { widgetConfigs } from "@askwell/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../lib/widget-config/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown, userId: null as string | null }));
vi.mock("@askwell/db/client", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));

const collection = await import("./route");
const item = await import("./[id]/route");

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
});

afterAll(() => close());

beforeEach(() => {
  state.userId = null;
});

const as = (userId: string | null) => {
  state.userId = userId;
};
const jsonRequest = (method: string, body?: unknown) =>
  new Request("https://app.test/api/projects", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function createAs(userId: string, name: string) {
  as(userId);
  const res = await collection.POST(jsonRequest("POST", { name }));
  return { res, body: await res.json() };
}

describe("unauthenticated", () => {
  it("returns 401 on every route", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const responses = [
      await collection.GET(),
      await collection.POST(jsonRequest("POST", { name: "X" })),
      await item.PATCH(jsonRequest("PATCH", { name: "X" }), ctx(id)),
      await item.DELETE(jsonRequest("DELETE"), ctx(id)),
    ];
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("unauthorized");
    }
  });
});

describe("POST /api/projects", () => {
  it("creates a project with a pk_ key and a widget_configs row", async () => {
    const { res, body } = await createAs("user_one", "Docs bot");
    expect(res.status).toBe(201);
    expect(body.project.publicKey).toMatch(/^pk_/);
    expect(body.project.name).toBe("Docs bot");
    expect(await db.select().from(widgetConfigs).where(eq(widgetConfigs.projectId, body.project.id))).toHaveLength(1);
  });

  it("refuses a Free owner's second project with 403 plan_limit", async () => {
    const { res, body } = await createAs("user_one", "Second");
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("plan_limit");
  });

  it("rejects a blank name and a non-JSON body with 400", async () => {
    expect((await createAs("user_two", "   ")).res.status).toBe(400);
    as("user_two");
    const res = await collection.POST(new Request("https://app.test/api/projects", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
  });

  it("sends no CORS headers (owner routes are same-origin)", async () => {
    as("user_one");
    expect((await collection.GET()).headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("owner isolation", () => {
  it("lists only the signed-in owner's projects", async () => {
    await createAs("owner_a", "A's");
    await createAs("owner_b", "B's");
    as("owner_a");
    const { projects } = await (await collection.GET()).json();
    expect(projects.map((p: { name: string }) => p.name)).toEqual(["A's"]);
  });

  it("owner B gets 404 renaming or deleting owner A's project", async () => {
    const { body } = await createAs("owner_c", "C's");
    as("owner_d");
    expect((await item.PATCH(jsonRequest("PATCH", { name: "Mine now" }), ctx(body.project.id))).status).toBe(404);
    expect((await item.DELETE(jsonRequest("DELETE"), ctx(body.project.id))).status).toBe(404);
    as("owner_c");
    const { projects } = await (await collection.GET()).json();
    expect(projects[0].name).toBe("C's");
  });

  it("returns 404 for a malformed id", async () => {
    as("owner_c");
    expect((await item.DELETE(jsonRequest("DELETE"), ctx("not-a-uuid"))).status).toBe(404);
  });
});

describe("PATCH and DELETE /api/projects/:id", () => {
  it("renames the owner's project", async () => {
    const { body } = await createAs("owner_e", "Old");
    const res = await item.PATCH(jsonRequest("PATCH", { name: "New" }), ctx(body.project.id));
    expect(res.status).toBe(200);
    expect((await res.json()).project.name).toBe("New");
  });

  it("deletes the owner's project and its config", async () => {
    const { body } = await createAs("owner_f", "Doomed");
    const res = await item.DELETE(jsonRequest("DELETE"), ctx(body.project.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await db.select().from(widgetConfigs).where(eq(widgetConfigs.projectId, body.project.id))).toHaveLength(0);
  });
});
