"use client";

import type { Plan } from "@askwell/shared";
import { useState } from "react";
import { openBillingPortal, startCheckout } from "../../lib/data/billing-actions";
import { FOCUS_ON_INK } from "../ui/styles";

const ACTION = {
  free: {
    label: "Upgrade to Pro",
    pending: "Opening checkout…",
    caption: "Opens Stripe Checkout.",
    demo: "Checkout isn't connected yet. When it is, this button opens Stripe Checkout, and Pro starts once the payment goes through.",
    run: startCheckout,
    className: "bg-inverse text-ink hover:bg-inverse/90",
  },
  pro: {
    label: "Manage subscription",
    pending: "Opening portal…",
    caption: "Opens the Stripe portal: change your card, see invoices or cancel.",
    demo: "The billing portal isn't connected yet. When it is, this button opens it in Stripe.",
    run: openBillingPortal,
    className: "border border-inverse/25 text-inverse hover:bg-inverse/10",
  },
} as const;

/** Upgrade on Free, Manage subscription on Pro. */
export function PlanActions({ plan }: { plan: Plan }) {
  const action = ACTION[plan];
  const [status, setStatus] = useState<"idle" | "pending" | "demo" | "error">("idle");

  async function go() {
    setStatus("pending");
    try {
      // MOCK: Phase 5 sends the browser to the returned Stripe URL: window.location.assign(url).
      await action.run();
      setStatus("demo");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="sm:max-w-72">
      <button
        type="button"
        onClick={go}
        disabled={status === "pending"}
        className={`w-full rounded-md px-4 py-2.5 text-sm font-medium disabled:opacity-60 transition-colors ${action.className} ${FOCUS_ON_INK}`}
      >
        {status === "pending" ? action.pending : action.label}
      </button>
      <p className="mt-2 text-xs text-inverse/70">{action.caption}</p>
      <div role="status" className="empty:hidden">
        {status === "demo" && (
          <p className="mt-3 rounded-md border border-dashed border-inverse/30 px-3 py-2 text-xs text-inverse/85">
            <span className="font-semibold text-inverse">Demo.</span> {action.demo}
          </p>
        )}
      </div>
      {status === "error" && (
        <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
          That didn&apos;t open. Check your connection, then try again.
        </p>
      )}
    </div>
  );
}
