import { DEFAULT_WIDGET_CONFIG, type WidgetSettings } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import {
  changedFields,
  customizeReducer,
  fieldErrors,
  initialState,
  previewConfig,
  type CustomizeAction,
  type CustomizeState,
} from "./form";

const STORED: WidgetSettings = { ...DEFAULT_WIDGET_CONFIG };
const run = (state: CustomizeState, ...actions: CustomizeAction[]) => actions.reduce(customizeReducer, state);

describe("initialState", () => {
  it("is editable for Pro and locked for Free", () => {
    expect(initialState(STORED, "pro").locked).toBe(false);
    expect(initialState(STORED, "free").locked).toBe(true);
  });
});

describe("customizeReducer", () => {
  it("each change updates the draft, so the preview follows it live", () => {
    const state = run(
      initialState(STORED, "pro"),
      { type: "set", field: "button_color", value: "#e11d48" },
      { type: "set", field: "position", value: "top-left" },
      { type: "set", field: "label", value: "Questions?" },
      { type: "set", field: "animation", value: "scale" },
      { type: "set", field: "header_text", value: "We're here" },
      { type: "set", field: "show_badge", value: false },
    );
    expect(previewConfig(state, "pro")).toEqual({
      button_color: "#e11d48",
      position: "top-left",
      label: "Questions?",
      animation: "scale",
      header_text: "We're here",
      show_badge: false,
    });
    expect(state.stored).toEqual(STORED);
  });

  it("ignores changes while locked", () => {
    const state = run(initialState(STORED, "free"), { type: "set", field: "label", value: "Hi" });
    expect(state.draft).toEqual(STORED);
  });

  it("saved: the response becomes the stored config, and the form is clean", () => {
    const state = run(
      initialState(STORED, "pro"),
      { type: "set", field: "label", value: "Hi" },
      { type: "saving" },
      { type: "saved", config: { ...STORED, label: "Hi", project_id: "p1" } as WidgetSettings },
    );
    expect(state.status).toEqual({ kind: "saved" });
    expect(state.stored).toEqual({ ...STORED, label: "Hi" });
    expect(changedFields(state.stored, state.draft)).toEqual({});
  });

  it("402 payment_required locks the form and drops the unsaved draft (upgrade prompt)", () => {
    const state = run(
      initialState(STORED, "pro"),
      { type: "set", field: "label", value: "Hi" },
      { type: "saving" },
      { type: "failed", error: { code: "payment_required", message: "Pro only." } },
    );
    expect(state.locked).toBe(true);
    expect(state.draft).toEqual(STORED);
    expect(state.status).toEqual({ kind: "idle" });
  });

  it("any other error keeps the draft and shows the message", () => {
    const state = run(
      initialState(STORED, "pro"),
      { type: "set", field: "label", value: "Hi" },
      { type: "saving" },
      { type: "failed", error: { code: "internal", message: "Something went wrong. Try again." } },
    );
    expect(state.locked).toBe(false);
    expect(state.draft.label).toBe("Hi");
    expect(state.status).toEqual({ kind: "error", message: "Something went wrong. Try again." });
  });

  it("reset discards the draft", () => {
    const state = run(initialState(STORED, "pro"), { type: "set", field: "label", value: "Hi" }, { type: "reset" });
    expect(state.draft).toEqual(STORED);
  });
});

describe("changedFields", () => {
  it("sends only the fields that changed, trimmed, with the color lowercased", () => {
    expect(
      changedFields(STORED, { ...STORED, button_color: "#E11D48", label: "  Questions?  ", header_text: STORED.header_text }),
    ).toEqual({ button_color: "#e11d48", label: "Questions?" });
  });

  it("is empty when nothing changed (including whitespace-only or case-only edits)", () => {
    expect(changedFields(STORED, { ...STORED, label: ` ${STORED.label} `, button_color: STORED.button_color.toUpperCase() })).toEqual({});
  });

  it("covers every field", () => {
    expect(
      Object.keys(
        changedFields(STORED, {
          button_color: "#111111",
          position: "top-right",
          label: "A",
          animation: "slide",
          header_text: "B",
          show_badge: false,
        }),
      ).sort(),
    ).toEqual(["animation", "button_color", "header_text", "label", "position", "show_badge"]);
  });
});

describe("fieldErrors", () => {
  it("uses the shared schema limits", () => {
    expect(fieldErrors(STORED)).toEqual({});
    expect(fieldErrors({ ...STORED, button_color: "red", label: " ", header_text: "x".repeat(81) })).toEqual({
      button_color: "Use a hex color like #1a2b3c.",
      label: "Add a label.",
      header_text: "Keep the header shorter.",
    });
    expect(fieldErrors({ ...STORED, label: "x".repeat(41) }).label).toBe("Keep the label shorter.");
  });
});

describe("previewConfig", () => {
  it("Free (locked) shows what Free visitors see: defaults and the badge", () => {
    const custom: WidgetSettings = { button_color: "#e11d48", position: "top-left", label: "Hi", animation: "scale", header_text: "Yo", show_badge: false };
    expect(previewConfig(initialState(custom, "free"), "free")).toEqual(DEFAULT_WIDGET_CONFIG);
    expect(previewConfig(initialState(custom, "pro"), "pro")).toEqual(custom);
  });
});
