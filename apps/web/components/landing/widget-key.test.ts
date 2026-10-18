import { describe, expect, it } from "vitest";
import { landingWidgetKey } from "./widget-key";

describe("landingWidgetKey", () => {
  it("returns the configured public key", () => {
    expect(landingWidgetKey({ LANDING_WIDGET_KEY: " pk_askwell_landing " })).toBe("pk_askwell_landing");
  });

  it.each([
    ["unset", {}],
    ["empty", { LANDING_WIDGET_KEY: "" }],
    ["not a public key", { LANDING_WIDGET_KEY: "sk_live_oops" }],
  ])("returns null when %s", (_label, env) => {
    expect(landingWidgetKey(env)).toBeNull();
  });
});
