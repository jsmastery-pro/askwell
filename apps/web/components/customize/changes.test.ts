import { updateWidgetConfigRequestSchema, WIDGET_DEFAULTS } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { buildChanges, isHexColor, validateDraft } from "./changes";

const saved = { ...WIDGET_DEFAULTS, buttonColor: "#16a34a", label: "Need help?" };

describe("buildChanges", () => {
  it("sends only what changed, and the result passes the shared schema", () => {
    const changes = buildChanges(saved, { ...saved, position: "top-left", showBadge: false });
    expect(changes).toEqual({ position: "top-left", showBadge: false });
    updateWidgetConfigRequestSchema.parse(changes);
  });

  it("sends null for a text field reset to its default", () => {
    const changes = buildChanges(saved, { ...saved, label: WIDGET_DEFAULTS.label, buttonColor: WIDGET_DEFAULTS.buttonColor });
    expect(changes).toEqual({ label: null, buttonColor: null });
    updateWidgetConfigRequestSchema.parse(changes);
  });

  it("trims text and ignores whitespace-only edits", () => {
    expect(buildChanges(saved, { ...saved, label: "  Need help?  " })).toEqual({});
    expect(buildChanges(saved, { ...saved, headerText: "  Talk to us " })).toEqual({ headerText: "Talk to us" });
  });

  it("is empty when nothing changed", () => {
    expect(buildChanges(saved, { ...saved })).toEqual({});
  });
});

describe("validateDraft", () => {
  it("accepts a valid config", () => {
    expect(validateDraft(saved)).toEqual({});
  });

  it("explains each invalid field", () => {
    const errors = validateDraft({ ...saved, buttonColor: "green", label: "  ", headerText: "x".repeat(61) });
    expect(errors).toEqual({
      buttonColor: "Use a 6-digit hex color, like #4f46e5.",
      label: "Add a label of 40 characters or fewer.",
      headerText: "Add header text of 60 characters or fewer.",
    });
  });
});

describe("isHexColor", () => {
  it.each([["#4f46e5", true], ["#ABCDEF", true], ["4f46e5", false], ["#fff", false], ["#12345g", false]])(
    "%s → %s",
    (value, expected) => expect(isHexColor(value)).toBe(expected),
  );
});
