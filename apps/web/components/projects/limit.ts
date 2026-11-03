// What to tell an owner who hit their plan's project limit (A3 → 403
// `plan_limit_reached`). The numbers come from PLAN_LIMITS, never literals.
import { PLAN_LIMITS, type Plan } from "@askwell/shared";

export type LimitPrompt = {
  message: string;
  /** Only Free can upgrade; Pro is already the top plan. */
  upgrade: boolean;
};

const projects = (n: number) => `${n} project${n === 1 ? "" : "s"}`;

export function limitPrompt(plan: Plan): LimitPrompt {
  if (plan === "free") {
    return {
      message: `Free includes ${projects(PLAN_LIMITS.free.projects)}. Upgrade to Pro for ${PLAN_LIMITS.pro.projects}.`,
      upgrade: true,
    };
  }
  return {
    message: `Pro includes ${projects(PLAN_LIMITS.pro.projects)}. Delete one to create another.`,
    upgrade: false,
  };
}
