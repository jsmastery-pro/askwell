import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { contrastRatio, textColorOn } from "./contrast";

const hex = (color: "#000" | "#fff") => (color === "#000" ? "#000000" : "#ffffff");

describe("textColorOn", () => {
  it("picks black on mid gray, where white only reaches about 3.95:1", () => {
    expect(contrastRatio("#808080", "#ffffff")).toBeCloseTo(3.95, 1);
    expect(textColorOn("#808080")).toBe("#000");
  });

  it("picks white on the default indigo and black on white", () => {
    expect(textColorOn(DEFAULT_WIDGET_CONFIG.buttonColor)).toBe("#fff");
    expect(textColorOn("#ffffff")).toBe("#000");
    expect(textColorOn("#000000")).toBe("#fff");
  });

  it("always picks the higher-contrast option", () => {
    for (const background of ["#808080", "#16a34a", "#4f46e5", "#f2a33c", "#777777", "#ff0000", "#0000ff"]) {
      const chosen = contrastRatio(background, hex(textColorOn(background)));
      const other = contrastRatio(background, hex(textColorOn(background) === "#000" ? "#fff" : "#000"));
      expect(chosen).toBeGreaterThanOrEqual(other);
    }
  });

  it("matches the WCAG extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#4f46e5", "#4f46e5")).toBe(1);
  });
});
