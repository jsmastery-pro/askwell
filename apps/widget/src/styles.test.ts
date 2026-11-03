import { describe, expect, it } from "vitest";
import { DEFAULT_WIDGET_CONFIG, type WidgetSettings } from "../../../packages/shared/src/index";
import { hiddenTransform, textColorOn, widgetCss } from "./styles";

const css = (overrides: Partial<WidgetSettings>) => widgetCss({ ...DEFAULT_WIDGET_CONFIG, ...overrides });
/** The declarations of the first rule for `selector`. */
const rule = (sheet: string, selector: string) =>
  sheet.match(new RegExp(`(?:^|})${selector.replace(/[.[\]]/g, "\\$&")}\\{([^}]*)\\}`))?.[1] ?? "";

describe("widgetCss", () => {
  it("colors the button with button_color and readable text", () => {
    const b = rule(css({ button_color: "#1d4ed8" }), ".b");
    expect(b).toContain("background:#1d4ed8");
    expect(b).toContain("color:#fff");
    expect(rule(css({ button_color: "#facc15" }), ".b")).toContain("color:#000");
  });

  it.each([
    ["bottom-right", "bottom:20px", "right:20px", "bottom:84px", "right:20px"],
    ["bottom-left", "bottom:20px", "left:20px", "bottom:84px", "left:20px"],
    ["top-right", "top:20px", "right:20px", "top:84px", "right:20px"],
    ["top-left", "top:20px", "left:20px", "top:84px", "left:20px"],
  ] as const)("puts the button and panel in the %s corner", (position, bv, bh, pv, ph) => {
    const sheet = css({ position });
    expect(rule(sheet, ".b")).toContain(bv);
    expect(rule(sheet, ".b")).toContain(bh);
    expect(rule(sheet, ".p")).toContain(pv);
    expect(rule(sheet, ".p")).toContain(ph);
  });

  it("starts each animation from its own transform", () => {
    expect(rule(css({ animation: "fade" }), ".p")).toContain("transform:none");
    expect(rule(css({ animation: "slide", position: "bottom-right" }), ".p")).toContain("translateY(16px)");
    expect(rule(css({ animation: "slide", position: "top-left" }), ".p")).toContain("translateY(-16px)");
    expect(rule(css({ animation: "scale" }), ".p")).toContain("scale(.94)");
    expect(hiddenTransform("fade", false)).toBe("none");
  });

  it("keeps the panel about 380 × 600 and full screen under 480 px", () => {
    const sheet = css({});
    expect(rule(sheet, ".p")).toContain("width:380px");
    expect(rule(sheet, ".p")).toContain("var(--h,600px)");
    expect(sheet).toMatch(/@media \(max-width:479px\)\{\.p\{top:0;right:0;bottom:0;left:0;/);
  });

  it("turns animations off under prefers-reduced-motion", () => {
    expect(css({})).toContain("@media (prefers-reduced-motion:reduce){.p,.p.o{transition:none;transform:none}}");
  });

  it("resets inherited host styles and shows a focus ring", () => {
    const sheet = css({ button_color: "#ff0066" });
    expect(sheet.startsWith(":host{all:initial}")).toBe(true);
    expect(rule(sheet, ".b:focus-visible")).toContain("outline:3px solid #ff0066");
  });
});

describe("textColorOn", () => {
  it("picks white on dark and black on light colors", () => {
    expect(textColorOn("#000000")).toBe("#fff");
    expect(textColorOn("#ffffff")).toBe("#000");
    expect(textColorOn("#ff0066")).toBe("#fff");
  });
});
