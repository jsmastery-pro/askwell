import { PLAN_LIMITS, type Plan } from "./plans";
import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "./widget";

// Same object as DEFAULT_WIDGET_CONFIG (P1-T03); the P2-T01 name for it.
export const WIDGET_DEFAULTS: WidgetConfig = DEFAULT_WIDGET_CONFIG;

// A widget_configs row as stored. Null text fields mean "use the default".
export type StoredWidgetConfig = {
  buttonColor: string | null;
  position: WidgetConfig["position"];
  label: string | null;
  animation: WidgetConfig["animation"];
  headerText: string | null;
  showBadge: boolean;
};

// The server calls this with the plan it read itself (§9 plan bypass). Free ignores stored values.
export function applyPlanToConfig(stored: StoredWidgetConfig | null, plan: Plan): WidgetConfig {
  if (!PLAN_LIMITS[plan].customizeWidget || !stored) {
    return { ...WIDGET_DEFAULTS, showBadge: true };
  }
  return {
    buttonColor: stored.buttonColor ?? WIDGET_DEFAULTS.buttonColor,
    position: stored.position,
    label: stored.label ?? WIDGET_DEFAULTS.label,
    animation: stored.animation,
    headerText: stored.headerText ?? WIDGET_DEFAULTS.headerText,
    showBadge: stored.showBadge,
  };
}
