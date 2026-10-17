// @vitest-environment node
import { widgetConfigs } from "@askwell/db";
import { WIDGET_DEFAULTS } from "@askwell/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedProject, type TestDb } from "../../../../../lib/widget-config/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown, userId: null as string | null }));
vi.mock("@askwell/db/client", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));

const { PATCH } = await import("./route");

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
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown) =>
  new Request("https://app.test/api/projects/x/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

async function storedConfig(projectId: string) {
  const [row] = await db.select().from(widgetConfigs).where(eq(widgetConfigs.projectId, projectId));
  return row;
}

describe("unauthenticated", () => {
  it("returns 401", async () => {
    const res = await PATCH(patch({ label: "x" }), ctx("00000000-0000-4000-8000-000000000000"));
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/projects/:id/config", () => {
  it("returns 404 for another owner's project", async () => {
    const project = await seedProject(db, { plan: "pro", publicKey: "pk_cfg_other" });
    as("someone_else");
    const res = await PATCH(patch({ label: "New" }), ctx(project.id));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("returns 404 for a malformed id", async () => {
    as("user_doesnt_matter");
    const res = await PATCH(patch({ label: "New" }), ctx("not-a-uuid"));
    expect(res.status).toBe(404);
  });

  it("refuses a Free owner with 402 and writes nothing", async () => {
    // config: {} forces the project-creation invariant (a row always exists) so this proves
    // the row is untouched, not just absent.
    const project = await seedProject(db, { plan: "free", publicKey: "pk_cfg_free", config: {} });
    as("user_pk_cfg_free");
    const res = await PATCH(patch({ label: "New label" }), ctx(project.id));
    const body = await res.json();
    expect(res.status).toBe(402);
    expect(body.error.code).toBe("payment_required");
    expect(await storedConfig(project.id)).toMatchObject({ label: null });
  });

  it("rejects an invalid body with 400", async () => {
    const project = await seedProject(db, { plan: "pro", publicKey: "pk_cfg_invalid" });
    as("user_pk_cfg_invalid");
    const res = await PATCH(patch({ buttonColor: "not-a-hex-color" }), ctx(project.id));
    expect(res.status).toBe(400);
  });

  it("saves a Pro owner's changes and returns the updated config", async () => {
    const project = await seedProject(db, { plan: "pro", publicKey: "pk_cfg_pro" });
    as("user_pk_cfg_pro");

    const res = await PATCH(patch({ position: "top-right", label: "Ask us anything" }), ctx(project.id));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.config).toEqual({
      ...WIDGET_DEFAULTS,
      position: "top-right",
      label: "Ask us anything",
    });
    expect(await storedConfig(project.id)).toMatchObject({ position: "top-right", label: "Ask us anything" });
  });

  it("resets a text field to its default on null", async () => {
    const project = await seedProject(db, {
      plan: "pro",
      publicKey: "pk_cfg_reset",
      config: { buttonColor: "#ff0000", label: "Custom label" },
    });
    as("user_pk_cfg_reset");

    const res = await PATCH(patch({ buttonColor: null }), ctx(project.id));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.config.buttonColor).toBe(WIDGET_DEFAULTS.buttonColor);
    expect(body.config.label).toBe("Custom label");
    expect(await storedConfig(project.id)).toMatchObject({ buttonColor: null, label: "Custom label" });
  });
});
