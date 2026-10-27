// @vitest-environment node
import { WIDGET_DEFAULTS } from "@askwell/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWidgetConfigByKey } from "./index";

vi.mock("server-only", () => ({}));

// getWidgetConfigByKey runs through the service client (SB-T05), passed in explicitly here so
// this test never depends on how createServiceClient() itself is built.
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
