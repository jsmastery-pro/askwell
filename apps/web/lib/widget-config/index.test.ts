// @vitest-environment node
import { WIDGET_DEFAULTS } from "@askwell/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getWidgetConfigByKey } from "./index";
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
