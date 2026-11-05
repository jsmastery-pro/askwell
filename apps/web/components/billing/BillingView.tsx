"use client";

import { PricingTable, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PLAN_LIMITS, PLAN_PRICES, type Plan } from "@askwell/shared";
import { Button, GlassPanel, Skeleton, Spinner } from "../ui";
import { PLAN_NAMES } from "../landing/pricing-rows";
import {
  ACTIVATION_POLL_MS,
  activationState,
  CHECKOUT_RETURN_URL,
  shouldPoll,
  type Activation,
} from "./activation";

export interface BillingViewProps {
  /** The owner's plan, read on the server (loadOwnPlan). Never decided here. */
  plan: Plan;
  /** We came back from Clerk's checkout (?checkout=success). */
  afterCheckout: boolean;
  /** Start this many ms into activation (tests). */
  initialElapsedMs?: number;
}

/** The account portal's billing section (cancel, change card, invoices). */
export function accountPortalBillingUrl(userProfileUrl: string): string {
  return `${userProfileUrl.replace(/\/+$/, "")}/billing`;
}

/** What the current plan includes, from PLAN_LIMITS. */
function planSummary(plan: Plan): string {
  const { projects, messagesPerMonth, knowledgeSources } = PLAN_LIMITS[plan];
  const n = (x: number) => x.toLocaleString("en-US");
  return `${n(projects)} project${projects === 1 ? "" : "s"} · ${n(messagesPerMonth)} messages / month per project · ${n(knowledgeSources)} knowledge sources per project`;
}

export function CurrentPlan({ plan }: { plan: Plan }) {
  return (
    <GlassPanel className="flex flex-col gap-2" aria-labelledby="current-plan-heading">
      <p className="text-sm text-fg-muted">Current plan</p>
      <h2 id="current-plan-heading" className="text-2xl font-semibold tracking-tight text-fg" data-plan={plan}>
        {PLAN_NAMES[plan]} <span className="text-base font-normal text-fg-muted">{PLAN_PRICES[plan].display}</span>
      </h2>
      <p className="text-sm text-fg-muted">{planSummary(plan)}</p>
    </GlassPanel>
  );
}

/** "Activating Pro…" or the timeout message, while the webhook catches up. */
export function ActivationNotice({ state }: { state: Activation }) {
  if (state === "activating") {
    return (
      <GlassPanel role="status" className="flex items-center gap-3">
        <Spinner size="sm" label="Activating Pro" />
        <p className="text-sm text-fg">Activating Pro… This takes a few seconds after payment.</p>
      </GlassPanel>
    );
  }
  if (state === "timed-out") {
    return (
      <GlassPanel role="status" className="flex flex-col gap-1">
        <p className="text-sm font-medium text-fg">Payment received. Your plan will update shortly.</p>
        <p className="text-sm text-fg-muted">Refresh in a minute.</p>
      </GlassPanel>
    );
  }
  return null;
}

function ManageSubscription() {
  const clerk = useClerk();
  return (
    <GlassPanel className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-fg">You&apos;re on Pro</h2>
        <p className="text-sm text-fg-muted">
          Cancel, change your card or see invoices in your account. A canceled plan stays Pro until the end of the
          period you paid for.
        </p>
      </div>
      <Button
        className="self-start"
        disabled={!clerk.loaded}
        onClick={() => window.location.assign(accountPortalBillingUrl(clerk.buildUserProfileUrl()))}
      >
        Manage subscription
      </Button>
    </GlassPanel>
  );
}

function PricingFallback() {
  return (
    <div role="status" aria-label="Loading plans" className="grid gap-4 sm:grid-cols-2">
      {[0, 1].map((i) => (
        <GlassPanel key={i} className="flex flex-col gap-3">
          <Skeleton shape="text" className="w-20" />
          <Skeleton className="h-8 w-28" />
          <Skeleton shape="text" className="w-48 max-w-full" />
          <Skeleton className="h-10 w-full" />
        </GlassPanel>
      ))}
    </div>
  );
}

/**
 * The billing screen (§6.10). Free: the current plan and Clerk's pricing
 * table (prices come from Clerk). Pro: "You're on Pro" and Manage
 * subscription. After checkout, re-checks the plan on the server until the
 * webhook has made it Pro, or times out.
 */
export function BillingView({ plan, afterCheckout, initialElapsedMs = 0 }: BillingViewProps) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(initialElapsedMs);
  const state = activationState(afterCheckout, plan, elapsed);

  useEffect(() => {
    if (!shouldPoll(state)) return;
    const id = setTimeout(() => {
      router.refresh();
      setElapsed((ms) => ms + ACTIVATION_POLL_MS);
    }, ACTIVATION_POLL_MS);
    return () => clearTimeout(id);
  }, [state, elapsed, router]);

  // Activated: drop ?checkout=success so a later reload doesn't poll again.
  useEffect(() => {
    if (state === "activated") router.replace("/dashboard/billing", { scroll: false });
  }, [state, router]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ActivationNotice state={state} />
      <CurrentPlan plan={plan} />
      {plan === "pro" ? (
        <ManageSubscription />
      ) : (
        <section aria-labelledby="upgrade-heading" className="flex min-w-0 flex-col gap-3">
          <h2 id="upgrade-heading" className="text-lg font-semibold text-fg">
            Upgrade to Pro
          </h2>
          <div className="min-w-0">
            <PricingTable newSubscriptionRedirectUrl={CHECKOUT_RETURN_URL} fallback={<PricingFallback />} />
          </div>
        </section>
      )}
    </div>
  );
}

/** Placeholder with the page's layout. */
export function BillingSkeleton() {
  return (
    <div role="status" aria-label="Loading billing" className="flex flex-col gap-6">
      <GlassPanel className="flex flex-col gap-2">
        <Skeleton shape="text" className="w-24" />
        <Skeleton className="h-8 w-40" />
        <Skeleton shape="text" className="w-72 max-w-full" />
      </GlassPanel>
      <PricingFallback />
    </div>
  );
}
