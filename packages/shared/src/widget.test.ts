import { describe, expect, it } from "vitest";
import { applyPlanToWidgetConfig, DEFAULT_WIDGET_CONFIG, type WidgetSettings } from "./index";

const custom: WidgetSettings = {
  button_color: "#ff0066",
  position: "top-left",
  label: "Help",
  animation: "scale",
  header_text: "Hi there",
  show_badge: false,
};

describe("DEFAULT_WIDGET_CONFIG", () => {
  it("is the approved default", () => {
    expect(DEFAULT_WIDGET_CONFIG).toEqual({
      button_color: "#000000",
      position: "bottom-right",
      label: "Chat with us",
      animation: "fade",
      header_text: "Ask us anything",
      show_badge: true,
    });
  });
});

describe("applyPlanToWidgetConfig", () => {
  it("gives Free the defaults and the badge", () => {
    expect(applyPlanToWidgetConfig(custom, "free")).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it("keeps Pro's custom config", () => {
    expect(applyPlanToWidgetConfig(custom, "pro")).toEqual(custom);
  });
});
