// @vitest-environment node
import { WIDGET_DEFAULTS } from "@askwell/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getWidgetConfigByKey, upsertWidgetConfig } from "./index";
import { createTestDb, seedProject, type TestDb } from "./test-db";

// getWidgetConfigByKey now runs through the service client (SB-T05), passed in explicitly rather
// than defaulted in lib/widget-config/index.ts: that file is shared with upsertWidgetConfig,
// which the PATCH /api/projects/:id/config route still calls on Drizzle, and must not pick up a
// runtime dependency on a module only these two callers construct (route.ts, embed/page.tsx).
type Row = Record<string, unknown> | null;
const fake = { project: null as Row, account: null as Row, config: null as Row };

function from(table: string) {
  if (table === "projects") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.project, error: null }) }) }) };
  if (table === "accounts") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.account, error: null }) }) }) };
  if (table === "widget_configs") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.config, error: null }) }) }) };
  throw new Error(`unexpected table ${table}`);
}
const service = { from } as unknown as Parameters<typeof getWidgetConfigByKey>[1];

const custom = {
  buttonColor: "#ff0000",
  position: "top-left",
  label: "Help",
  animation: "slide",
  headerText: "Support",
  showBadge: false,
} as const;

beforeEach(() => {
  fake.project = null;
  fake.account = null;
  fake.config = null;
});

describe("getWidgetConfigByKey", () => {
  it("returns null for an unknown key", async () => {
    expect(await getWidgetConfigByKey("pk_missing", service)).toBeNull();
  });

  it("gives a Free project the defaults with the badge, ignoring its stored config", async () => {
    fake.project = { id: "p1", owner_id: "owner_1" };
    fake.account = { plan: "free" };
    fake.config = {
      button_color: custom.buttonColor,
      position: custom.position,
      label: custom.label,
      animation: custom.animation,
      header_text: custom.headerText,
      show_badge: custom.showBadge,
    };
    expect(await getWidgetConfigByKey("pk_free", service)).toEqual({ ...WIDGET_DEFAULTS, showBadge: true });
  });

  it("gives a Pro project its stored config", async () => {
    fake.project = { id: "p1", owner_id: "owner_1" };
    fake.account = { plan: "pro" };
    fake.config = {
      button_color: custom.buttonColor,
      position: custom.position,
      label: custom.label,
      animation: custom.animation,
      header_text: custom.headerText,
      show_badge: custom.showBadge,
    };
    expect(await getWidgetConfigByKey("pk_pro", service)).toEqual(custom);
  });

  it("fills a Pro project's null text fields with defaults", async () => {
    fake.project = { id: "p1", owner_id: "owner_1" };
    fake.account = { plan: "pro" };
    fake.config = {
      button_color: null,
      position: "top-right",
      label: null,
      animation: "fade",
      header_text: null,
      show_badge: true,
    };
    expect(await getWidgetConfigByKey("pk_pro_nulls", service)).toEqual({ ...WIDGET_DEFAULTS, position: "top-right" });
  });

  it("returns defaults when a project has no config row", async () => {
    fake.project = { id: "p1", owner_id: "owner_1" };
    fake.account = { plan: "pro" };
    fake.config = null;
    expect(await getWidgetConfigByKey("pk_no_config", service)).toEqual({ ...WIDGET_DEFAULTS, showBadge: true });
  });

  it("defaults to the Free plan when the account row is missing", async () => {
    fake.project = { id: "p1", owner_id: "owner_1" };
    fake.account = null;
    fake.config = null;
    expect(await getWidgetConfigByKey("pk_no_account", service)).toEqual({ ...WIDGET_DEFAULTS, showBadge: true });
  });

  it("returns only config fields, nothing about the project or owner", async () => {
    fake.project = { id: "p1", owner_id: "owner_1" };
    fake.account = { plan: "pro" };
    fake.config = {
      button_color: custom.buttonColor,
      position: custom.position,
      label: custom.label,
      animation: custom.animation,
      header_text: custom.headerText,
      show_badge: custom.showBadge,
    };
    const config = await getWidgetConfigByKey("pk_pro", service);
    expect(Object.keys(config ?? {}).sort()).toEqual(Object.keys(WIDGET_DEFAULTS).sort());
  });
});

describe("upsertWidgetConfig", () => {
  let db: TestDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(() => close());

  it("updates only the given fields, leaving others as stored", async () => {
    const project = await seedProject(db, { plan: "pro", publicKey: "pk_patch_partial", config: custom });
    const stored = await upsertWidgetConfig(project.id, { label: "New label" }, db);
    expect(stored).toEqual({ ...custom, label: "New label" });
  });

  it("stores null for a text field reset to default (null means default at read time)", async () => {
    const project = await seedProject(db, { plan: "pro", publicKey: "pk_patch_null", config: custom });
    const stored = await upsertWidgetConfig(project.id, { buttonColor: null, headerText: null }, db);
    expect(stored).toEqual({ ...custom, buttonColor: null, headerText: null });
  });

  it("is a no-op read when there are no changes", async () => {
    const project = await seedProject(db, { plan: "pro", publicKey: "pk_patch_empty", config: custom });
    expect(await upsertWidgetConfig(project.id, {}, db)).toEqual(custom);
  });

  it("creates a default row instead of throwing when there are no changes and no row yet", async () => {
    const project = await seedProject(db, { plan: "pro", publicKey: "pk_patch_empty_insert" });
    const stored = await upsertWidgetConfig(project.id, {}, db);
    expect(stored).toEqual({
      buttonColor: null,
      position: "bottom-right",
      label: null,
      animation: "fade",
      headerText: null,
      showBadge: true,
    });
  });

  it("inserts a row when the project has none yet", async () => {
    const project = await seedProject(db, { plan: "pro", publicKey: "pk_patch_insert" });
    const stored = await upsertWidgetConfig(project.id, { position: "top-right" }, db);
    expect(stored).toEqual({
      buttonColor: null,
      position: "top-right",
      label: null,
      animation: "fade",
      headerText: null,
      showBadge: true,
    });
  });
});
