// Widget config defaults (product owner approved) and the plan rules for applying them.
import type { Plan, WidgetAnimation, WidgetPosition } from "./enums";
import { PLAN_LIMITS } from "./plans";

/** The customizable widget fields: a `widget_configs` row without `project_id` (§7). */
export type WidgetSettings = {
  button_color: string;
  position: WidgetPosition;
  label: string;
  animation: WidgetAnimation;
  header_text: string;
  show_badge: boolean;
};

export const DEFAULT_WIDGET_CONFIG = {
  button_color: "#000000",
  position: "bottom-right",
  label: "Chat with us",
  animation: "fade",
  header_text: "Ask us anything",
  show_badge: true,
} as const satisfies WidgetSettings;

/**
 * The config a plan is allowed to show. Free gets the defaults for every
 * locked field and always shows the badge (§5, §8 `GET /api/widget/config`).
 */
export function applyPlanToWidgetConfig(config: WidgetSettings, plan: Plan): WidgetSettings {
  const limits = PLAN_LIMITS[plan];
  return {
    button_color: limits.customButtonColor ? config.button_color : DEFAULT_WIDGET_CONFIG.button_color,
    position: limits.customPosition ? config.position : DEFAULT_WIDGET_CONFIG.position,
    label: limits.customLabel ? config.label : DEFAULT_WIDGET_CONFIG.label,
    animation: limits.customAnimation ? config.animation : DEFAULT_WIDGET_CONFIG.animation,
    header_text: limits.customHeaderText ? config.header_text : DEFAULT_WIDGET_CONFIG.header_text,
    show_badge: limits.hideBadge ? config.show_badge : true,
  };
}
