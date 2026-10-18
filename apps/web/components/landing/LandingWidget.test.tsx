import { describe, expect, it } from "vitest";
import { LandingWidget } from "./LandingWidget";

describe("LandingWidget", () => {
  it("loads /widget.js with the project's key, after the page is interactive", () => {
    const element = LandingWidget({ publicKey: "pk_askwell_landing" });
    expect(element?.props).toMatchObject({ src: "/widget.js", "data-key": "pk_askwell_landing", strategy: "afterInteractive" });
  });

  it("renders nothing without a key", () => {
    expect(LandingWidget({ publicKey: null })).toBeNull();
  });
});
