// Keeps accounts.plan in sync with Clerk Billing (project.md §6.10, §7).
//
// Webhook events can arrive late, twice, or out of order, so an event is only
// a hint: for a relevant one, this re-reads the user's current subscription
// from Clerk's Backend API and stores what it says. Retries and reordering
// then always settle on the right plan.
import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { ClerkWebhookBody, Plan } from "@askwell/shared";
import { createServiceClient } from "../supabase/service";

/** The Clerk Billing plan slug that means Pro (the user plan in the Clerk dashboard). */
export const PRO_PLAN_SLUG = "pro";

/** A Supabase or Clerk call failed; `cause` has the details. The route answers 500 so Clerk retries. */
export class PlanSyncError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PlanSyncError";
  }
}

/**
 * The user an event is about, if it's about the Pro plan: a subscriptionItem.*
 * event whose plan is `pro`, or a subscription.* event with a `pro` item, paid
 * by a user (not an organization). Null for everything else (ignored).
 */
export function proEventUserId(event: ClerkWebhookBody): string | null {
  const { type, data } = event;
  const aboutPro = type.startsWith("subscriptionItem.")
    ? data.plan?.slug === PRO_PLAN_SLUG
    : type.startsWith("subscription.")
      ? (data.items ?? []).some((item) => item.plan?.slug === PRO_PLAN_SLUG)
      : false;
  if (!aboutPro) return null;
  return data.payer?.user_id ?? null;
}

/** The parts of a Clerk subscription item the plan depends on. */
export type SubscriptionItemLike = {
  status: string;
  plan: { slug: string } | null;
  periodEnd: number | null;
};

/**
 * Pro while a `pro` item is active. A canceled item keeps Pro until its paid
 * period ends: Clerk keeps it `active` until then; if it's ever reported as
 * `canceled` with time left in the period, that counts too. Everything else
 * (ended, expired, past due, abandoned, incomplete, upcoming) is Free.
 */
export function planFromItems(items: SubscriptionItemLike[], now: number): Plan {
  const pro = items.some(
    (item) =>
      item.plan?.slug === PRO_PLAN_SLUG &&
      (item.status === "active" || (item.status === "canceled" && item.periodEnd !== null && item.periodEnd > now)),
  );
  return pro ? "pro" : "free";
}

const isNotFound = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { status?: unknown }).status === 404;

/** The user's plan right now, from Clerk's Backend API. No subscription at all → Free. */
export async function currentPlan(userId: string, now = Date.now()): Promise<Plan> {
  try {
    const client = await clerkClient();
    const subscription = await client.billing.getUserBillingSubscription(userId);
    return planFromItems(subscription.subscriptionItems, now);
  } catch (error) {
    if (isNotFound(error)) return "free";
    throw new PlanSyncError("Couldn't read the user's subscription from Clerk.", { cause: error });
  }
}

/**
 * Stores `plan` for the user with the service client, creating the account
 * row if there isn't one (the account default is Free). Returns the plan it
 * replaced, or null if nothing changed. Each step is one atomic statement, so
 * of two concurrent deliveries only one sees the change.
 */
export async function storePlan(userId: string, plan: Plan): Promise<Plan | null> {
  const service = createServiceClient();
  const previous: Plan = plan === "pro" ? "free" : "pro";

  const updated = await service
    .from("accounts")
    .update({ plan })
    .eq("clerk_user_id", userId)
    .neq("plan", plan)
    .select("clerk_user_id");
  if (updated.error) throw new PlanSyncError("Couldn't update the account's plan.", { cause: updated.error });
  if (updated.data.length > 0) return previous;

  // No row changed: either the row already has `plan`, or there's no row yet.
  const inserted = await service
    .from("accounts")
    .upsert({ clerk_user_id: userId, plan }, { onConflict: "clerk_user_id", ignoreDuplicates: true })
    .select("clerk_user_id");
  if (inserted.error) throw new PlanSyncError("Couldn't create the account.", { cause: inserted.error });
  // A new account starts on Free (the column default), so storing Pro is a change.
  if (inserted.data.length > 0) return plan === "pro" ? "free" : null;
  return null;
}
