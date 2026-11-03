// Plan limits and prices (project.md §5). The only place they live.
// The server reads the plan; the client never decides what is allowed.
import type { Plan } from "./enums";

export type PlanLimits = {
  /** Projects per account. */
  projects: number;
  /** Messages per month, per project. */
  messagesPerMonth: number;
  /** Knowledge sources per project (files + pasted texts). */
  knowledgeSources: number;
  /** May set any button color (else the default). */
  customButtonColor: boolean;
  /** May use any corner (else bottom-right). */
  customPosition: boolean;
  /** May set the button label (else the default). */
  customLabel: boolean;
  /** May pick fade / slide / scale (else fade). */
  customAnimation: boolean;
  /** May set the header text (else the default). */
  customHeaderText: boolean;
  /** May hide the "Powered by" badge (else it is shown). */
  hideBadge: boolean;
};

export const PLAN_LIMITS = {
  free: {
    projects: 1,
    messagesPerMonth: 100,
    knowledgeSources: 3,
    customButtonColor: false,
    customPosition: false,
    customLabel: false,
    customAnimation: false,
    customHeaderText: false,
    hideBadge: false,
  },
  pro: {
    projects: 5,
    messagesPerMonth: 2000,
    knowledgeSources: 25,
    customButtonColor: true,
    customPosition: true,
    customLabel: true,
    customAnimation: true,
    customHeaderText: true,
    hideBadge: true,
  },
} as const satisfies Record<Plan, PlanLimits>;

export type PlanPrice = {
  /** USD per month. */
  usdPerMonth: number;
  /** Shown in the UI, e.g. "$19/month". */
  display: string;
};

// Must match the Clerk Billing plans (set up in Phase 5).
export const PLAN_PRICES = {
  free: { usdPerMonth: 0, display: "$0/month" },
  pro: { usdPerMonth: 19, display: "$19/month" },
} as const satisfies Record<Plan, PlanPrice>;
