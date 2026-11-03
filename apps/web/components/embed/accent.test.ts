import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { accentFor } from "./accent";

describe("accentFor", () => {
  it("uses white text on dark colors and black text on light ones", () => {
    expect(accentFor("#000000")).toEqual({ background: "#000000", foreground: "var(--color-white)" });
    expect(accentFor("#1d4ed8").foreground).toBe("var(--color-white)");
    expect(accentFor("#ffffff").foreground).toBe("var(--color-black)");
    expect(accentFor("#facc15").foreground).toBe("var(--color-black)");
  });

  it("falls back to the default color for anything that isn't #rrggbb", () => {
    for (const bad of ["red", "#fff", "#12345g", "url(javascript:alert(1))", "#000000;color:red"]) {
      expect(accentFor(bad).background).toBe(DEFAULT_WIDGET_CONFIG.button_color);
    }
  });
});
