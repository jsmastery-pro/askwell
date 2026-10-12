import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { textColorOn } from "./contrast";

describe("textColorOn", () => {
  it("picks black where white fails WCAG AA", () => {
    expect(textColorOn("#16a34a")).toBe("#000"); // white would be 3.3:1
    expect(textColorOn("#808080")).toBe("#000"); // white would be 3.95:1
  });

  it("picks white on dark brand colors", () => {
    expect(textColorOn(DEFAULT_WIDGET_CONFIG.buttonColor)).toBe("#fff");
    expect(textColorOn("#000000")).toBe("#fff");
  });

  it("picks black on white", () => {
    expect(textColorOn("#ffffff")).toBe("#000");
  });
});
