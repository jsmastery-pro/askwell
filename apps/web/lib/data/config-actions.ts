import {
  WIDGET_DEFAULTS,
  type UpdateWidgetConfigRequest,
  type UpdateWidgetConfigResponse,
  type WidgetConfig,
} from "@askwell/shared";
import { demoDelay } from "./demo";

// Client-callable writes. No database imports, so client components can use them.

// MOCK: replace with PATCH /api/projects/:id/config, which returns 402 on Free (Phase 5).
export async function saveWidgetConfig(
  projectId: string,
  current: WidgetConfig,
  changes: UpdateWidgetConfigRequest,
): Promise<UpdateWidgetConfigResponse> {
  void projectId;
  await demoDelay();
  return {
    config: {
      ...current,
      ...changes,
      // null resets a text field to its default, as the real route will.
      buttonColor: changes.buttonColor === null ? WIDGET_DEFAULTS.buttonColor : (changes.buttonColor ?? current.buttonColor),
      label: changes.label === null ? WIDGET_DEFAULTS.label : (changes.label ?? current.label),
      headerText: changes.headerText === null ? WIDGET_DEFAULTS.headerText : (changes.headerText ?? current.headerText),
    },
  };
}
