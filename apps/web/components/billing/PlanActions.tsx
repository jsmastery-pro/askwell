"use client";

import type { Plan } from "@askwell/shared";
import { PricingTable, useClerk } from "@clerk/nextjs";
import { FOCUS_ON_INK } from "../ui/styles";

/** Free: Clerk's own pricing table. Pro: Clerk's own account/billing management. */
export function PlanActions({ plan }: { plan: Plan }) {
  const clerk = useClerk();

  if (plan === "free") {
    return (
      <div className="w-full sm:max-w-sm">
        {/* Clerk's default ring is its neutral color at 15% opacity, too faint on its white cards. The
            value is the app's --color-focus, as a literal: Clerk derives shades from it in JavaScript. */}
        <PricingTable for="user" appearance={{ variables: { colorRing: "#09090b" } }} />
      </div>
    );
  }

  return (
    <div className="sm:max-w-72">
      <button
        type="button"
        onClick={() => clerk.openUserProfile()}
        className={`w-full rounded-md border border-inverse/25 px-4 py-2.5 text-sm font-medium text-inverse transition-colors hover:bg-inverse/10 ${FOCUS_ON_INK}`}
      >
        Manage subscription
      </button>
      <p className="mt-2 text-xs text-inverse/70">Change your plan, update payment, or cancel.</p>
    </div>
  );
}
