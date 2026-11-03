import { PLAN_LIMITS, PLANS, WIDGET_ANIMATIONS, type Plan, type PlanLimits } from "@askwell/shared";

// The pricing table rows (§5), built from PLAN_LIMITS. No number lives here.

export interface PricingRow {
  label: string;
  values: Record<Plan, string>;
}

const formatCount = (n: number) => n.toLocaleString("en-US");
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const rowDefs: Array<{ label: string; value: (limits: PlanLimits) => string }> = [
  { label: "Projects", value: (l) => formatCount(l.projects) },
  { label: "Messages / month (per project)", value: (l) => formatCount(l.messagesPerMonth) },
  { label: "Knowledge sources (per project)", value: (l) => formatCount(l.knowledgeSources) },
  { label: "Button color", value: (l) => (l.customButtonColor ? "Any" : "Default") },
  { label: "Button position", value: (l) => (l.customPosition ? "Any corner" : "Bottom right") },
  { label: "Button label", value: (l) => (l.customLabel ? "Custom" : "Default") },
  {
    label: "Open animation",
    value: (l) =>
      l.customAnimation
        ? capitalize(WIDGET_ANIMATIONS.join(" / "))
        : capitalize(WIDGET_ANIMATIONS[0]),
  },
  { label: "Header text", value: (l) => (l.customHeaderText ? "Custom" : "Default") },
  { label: "“Powered by” badge", value: (l) => (l.hideBadge ? "Hidden" : "Shown") },
];

export const PRICING_ROWS: PricingRow[] = rowDefs.map(({ label, value }) => ({
  label,
  values: Object.fromEntries(PLANS.map((plan) => [plan, value(PLAN_LIMITS[plan])])) as Record<
    Plan,
    string
  >,
}));

export const PLAN_NAMES: Record<Plan, string> = { free: "Free", pro: "Pro" };
