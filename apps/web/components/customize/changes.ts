import {
  updateWidgetConfigRequestSchema,
  WIDGET_DEFAULTS,
  type UpdateWidgetConfigRequest,
  type WidgetConfig,
} from "@askwell/shared";

export type FieldErrors = Partial<Record<keyof WidgetConfig, string>>;

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (value: string) => HEX.test(value);

// Text fields that can be reset: null in the request means "use the default".
const RESETTABLE = ["buttonColor", "label", "headerText"] as const;

/**
 * Only the fields that differ from what's saved. A resettable field that's back at its
 * default is sent as null, so the stored value is cleared rather than copied.
 */
export function buildChanges(saved: WidgetConfig, draft: WidgetConfig): UpdateWidgetConfigRequest {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(draft) as (keyof WidgetConfig)[]) {
    const value = typeof draft[key] === "string" ? (draft[key] as string).trim() : draft[key];
    if (value === saved[key]) continue;
    const resettable = (RESETTABLE as readonly string[]).includes(key);
    changes[key] = resettable && value === WIDGET_DEFAULTS[key] ? null : value;
  }
  return changes as UpdateWidgetConfigRequest;
}

const MESSAGES: Record<string, string> = {
  buttonColor: "Use a 6-digit hex color, like #4f46e5.",
  label: "Add a label of 40 characters or fewer.",
  headerText: "Add header text of 60 characters or fewer.",
};

export function validateDraft(draft: WidgetConfig): FieldErrors {
  const errors: FieldErrors = {};
  if (!isHexColor(draft.buttonColor)) errors.buttonColor = MESSAGES.buttonColor;
  const parsed = updateWidgetConfigRequestSchema.safeParse({
    label: draft.label,
    headerText: draft.headerText,
    position: draft.position,
    animation: draft.animation,
    showBadge: draft.showBadge,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof WidgetConfig;
      errors[key] ??= MESSAGES[key] ?? "Check this field.";
    }
  }
  return errors;
}
