import { describe, expect, it } from "vitest";
import { WIDGET_DEFAULTS, applyPlanToConfig, type StoredWidgetConfig } from "./widget-plan";

const custom: StoredWidgetConfig = {
  buttonColor: "#ff0000",
  position: "top-left",
  label: "Help",
  animation: "slide",
  headerText: "Support",
  showBadge: false,
};

describe("applyPlanToConfig", () => {
  it("free ignores stored values and keeps the badge on", () => {
    expect(applyPlanToConfig(custom, "free")).toEqual({ ...WIDGET_DEFAULTS, showBadge: true });
  });

  it("pro uses stored values and honours the badge setting", () => {
    expect(applyPlanToConfig(custom, "pro")).toEqual(custom);
  });

  it("pro falls back to defaults for null text fields", () => {
    const config = applyPlanToConfig({ ...custom, buttonColor: null, label: null, headerText: null }, "pro");
    expect(config.buttonColor).toBe(WIDGET_DEFAULTS.buttonColor);
    expect(config.label).toBe(WIDGET_DEFAULTS.label);
    expect(config.headerText).toBe(WIDGET_DEFAULTS.headerText);
    expect(config.position).toBe("top-left");
    expect(config.showBadge).toBe(false);
  });

  it("returns defaults when no config is stored", () => {
    expect(applyPlanToConfig(null, "pro")).toEqual({ ...WIDGET_DEFAULTS, showBadge: true });
  });
});
