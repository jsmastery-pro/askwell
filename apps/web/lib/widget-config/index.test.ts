// @vitest-environment node
import { WIDGET_DEFAULTS } from "@askwell/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getWidgetConfigByKey, upsertWidgetConfig } from "./index";
import { createTestDb, seedProject, type TestDb } from "./test-db";

const custom = {
  buttonColor: "#ff0000",
  position: "top-left",
  label: "Help",
  animation: "slide",
  headerText: "Support",
  showBadge: false,
} as const;

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedProject(db, { plan: "free", publicKey: "pk_free", config: custom });
  await seedProject(db, { plan: "pro", publicKey: "pk_pro", config: custom });
  await seedProject(db, { plan: "pro", publicKey: "pk_pro_nulls", config: { position: "top-right" } });
  await seedProject(db, { plan: "pro", publicKey: "pk_no_config" });
});

afterAll(() => close());

describe("getWidgetConfigByKey", () => {
  it("returns null for an unknown key", async () => {
    expect(await getWidgetConfigByKey("pk_missing", db)).toBeNull();
  });

  it("gives a Free project the defaults with the badge, ignoring its stored config", async () => {
    expect(await getWidgetConfigByKey("pk_free", db)).toEqual({ ...WIDGET_DEFAULTS, showBadge: true });
  });

  it("gives a Pro project its stored config", async () => {
    expect(await getWidgetConfigByKey("pk_pro", db)).toEqual(custom);
  });

  it("fills a Pro project's null text fields with defaults", async () => {
    expect(await getWidgetConfigByKey("pk_pro_nulls", db)).toEqual({ ...WIDGET_DEFAULTS, position: "top-right" });
  });

  it("returns defaults when a project has no config row", async () => {
    expect(await getWidgetConfigByKey("pk_no_config", db)).toEqual({ ...WIDGET_DEFAULTS, showBadge: true });
  });

  it("returns only config fields, nothing about the project or owner", async () => {
    const config = await getWidgetConfigByKey("pk_pro", db);
    expect(Object.keys(config ?? {}).sort()).toEqual(Object.keys(WIDGET_DEFAULTS).sort());
  });
});

describe("upsertWidgetConfig", () => {
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
