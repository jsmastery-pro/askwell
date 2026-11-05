// The Customize form's state, as a pure reducer (project.md §6.8): the stored
// config, the draft being edited, and the save status. The page renders from
// it; tests drive it without a DOM.
import {
  applyPlanToWidgetConfig,
  hexColorSchema,
  widgetHeaderTextSchema,
  widgetLabelSchema,
  type ApiError,
  type Plan,
  type UpdateWidgetConfigBody,
  type WidgetSettings,
} from "@askwell/shared";

export type FieldName = keyof WidgetSettings;
export type FieldErrors = Partial<Record<FieldName, string>>;

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export type CustomizeState = {
  /** What's stored now (read on the server, then each successful save). */
  stored: WidgetSettings;
  /** What the owner is editing. */
  draft: WidgetSettings;
  /** Read-only: the plan isn't Pro, or a save came back 402. */
  locked: boolean;
  status: SaveStatus;
};

export type CustomizeAction =
  | { type: "set"; field: FieldName; value: WidgetSettings[FieldName] }
  | { type: "reset" }
  | { type: "saving" }
  | { type: "saved"; config: WidgetSettings }
  | { type: "failed"; error: ApiError["error"] };

export function initialState(stored: WidgetSettings, plan: Plan): CustomizeState {
  return { stored, draft: stored, locked: plan !== "pro", status: { kind: "idle" } };
}

/** Only the six widget fields of a stored row (drops project_id). */
export function settingsOf(config: WidgetSettings): WidgetSettings {
  const { button_color, position, label, animation, header_text, show_badge } = config;
  return { button_color, position, label, animation, header_text, show_badge };
}

export function customizeReducer(state: CustomizeState, action: CustomizeAction): CustomizeState {
  switch (action.type) {
    case "set":
      // Locked, or a save is in flight: the response would overwrite the edit.
      if (state.locked || state.status.kind === "saving") return state;
      return { ...state, draft: { ...state.draft, [action.field]: action.value }, status: { kind: "idle" } };
    case "reset":
      return { ...state, draft: state.stored, status: { kind: "idle" } };
    case "saving":
      return { ...state, status: { kind: "saving" } };
    case "saved": {
      const stored = settingsOf(action.config);
      return { ...state, stored, draft: stored, status: { kind: "saved" } };
    }
    case "failed":
      // 402: the plan changed (e.g. a downgrade in another tab). The server is
      // the gate; lock the form and show the upgrade prompt.
      if (action.error.code === "payment_required") {
        return { ...state, locked: true, draft: state.stored, status: { kind: "idle" } };
      }
      return { ...state, status: { kind: "error", message: action.error.message } };
  }
}

/** Client-side checks with the same limits as the route's schema (packages/shared). */
export function fieldErrors(draft: WidgetSettings): FieldErrors {
  const errors: FieldErrors = {};
  if (!hexColorSchema.safeParse(draft.button_color).success) errors.button_color = "Use a hex color like #1a2b3c.";
  const label = widgetLabelSchema.safeParse(draft.label);
  if (!label.success) errors.label = draft.label.trim() ? "Keep the label shorter." : "Add a label.";
  const header = widgetHeaderTextSchema.safeParse(draft.header_text);
  if (!header.success) errors.header_text = draft.header_text.trim() ? "Keep the header shorter." : "Add a header.";
  return errors;
}

/** The fields that differ from what's stored, trimmed as the server stores them. Empty: nothing to save. */
export function changedFields(stored: WidgetSettings, draft: WidgetSettings): UpdateWidgetConfigBody {
  const changes: UpdateWidgetConfigBody = {};
  const color = draft.button_color.toLowerCase();
  if (color !== stored.button_color.toLowerCase()) changes.button_color = color;
  if (draft.position !== stored.position) changes.position = draft.position;
  if (draft.label.trim() !== stored.label) changes.label = draft.label.trim();
  if (draft.animation !== stored.animation) changes.animation = draft.animation;
  if (draft.header_text.trim() !== stored.header_text) changes.header_text = draft.header_text.trim();
  if (draft.show_badge !== stored.show_badge) changes.show_badge = draft.show_badge;
  return changes;
}

/** What the preview shows: the draft for Pro; for Free, what Free visitors see. */
export function previewConfig(state: CustomizeState, plan: Plan): WidgetSettings {
  return applyPlanToWidgetConfig(state.draft, state.locked ? "free" : plan);
}
