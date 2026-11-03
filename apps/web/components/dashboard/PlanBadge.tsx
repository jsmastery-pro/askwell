import { auth } from "@clerk/nextjs/server";
import type { Plan } from "@askwell/shared";
import { loadOwnPlan } from "../../lib/accounts/account";
import { Skeleton } from "../ui";
import { PLAN_NAMES } from "../landing/pricing-rows";

const badgeClasses =
  "inline-flex h-6 items-center rounded-full border border-line-strong bg-glass px-2.5 text-xs font-medium";

/** The plan pill: "Free" or "Pro". */
export function PlanPill({ plan }: { plan: Plan }) {
  return (
    <span className={`${badgeClasses} text-fg`} data-plan={plan}>
      <span className="sr-only">Plan: </span>
      {PLAN_NAMES[plan]}
    </span>
  );
}

/** Shown while the plan streams in. */
export function PlanBadgeSkeleton() {
  return <Skeleton shape="text" className="h-6 w-12" />;
}

/**
 * Makes sure the owner's account row exists, then shows their plan, read with
 * the owner client (RLS). Render inside <Suspense>: it reads the request.
 */
export async function PlanBadge() {
  // Outside the try: protect() signals a redirect by throwing.
  await auth.protect();
  const plan = await loadOwnPlan().catch((error: unknown) => {
    // The dashboard still works without the badge; the log has the cause.
    console.error("Couldn't load the account plan", error);
    return null;
  });
  if (plan) return <PlanPill plan={plan} />;
  return (
    <span className={`${badgeClasses} text-fg-muted`} role="status">
      Plan unavailable
    </span>
  );
}
