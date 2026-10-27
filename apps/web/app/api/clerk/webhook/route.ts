import type { Plan } from "@askwell/shared";
import { createServiceClient } from "../../../../lib/supabase/service";
import { clerkClient } from "@clerk/nextjs/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { captureServerEvent } from "../../../../lib/posthog/server";

export const dynamic = "force-dynamic";

// The Clerk Billing plan slug for Pro (dashboard, test mode). Other plans' events are ignored.
const PRO_PLAN_SLUG = "pro";

type ServiceClient = ReturnType<typeof createServiceClient>;

/** True only when an account row actually changed plan, so a redelivered webhook is a no-op. */
async function setPlan(service: ServiceClient, clerkUserId: string, plan: Plan): Promise<boolean> {
  const { data, error } = await service
    .from("accounts")
    .update({ plan })
    .eq("clerk_user_id", clerkUserId)
    .neq("plan", plan)
    .select("clerk_user_id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

type SubscriptionItem = { status: string; periodEnd: number | null; endedAt: number | null; plan: { slug: string } | null };

/**
 * Whether a Pro item entitles the user to Pro right now: active, or canceled but still inside
 * the period it was paid for (a cancellation keeps Pro until then, project.md §6.10).
 */
function entitlesToPro(item: SubscriptionItem, now: number): boolean {
  if (item.plan?.slug !== PRO_PLAN_SLUG) return false;
  if (item.status === "active") return true;
  return item.status === "canceled" && item.endedAt === null && item.periodEnd !== null && item.periodEnd > now;
}

/**
 * Asks Clerk whether the user is entitled to Pro right now. Webhooks can arrive late or be
 * retried, so a stale `subscriptionItem.active` must not re-grant Pro after it ended.
 */
async function proIsActiveNow(userId: string): Promise<boolean> {
  const subscription = await (await clerkClient()).billing.getUserBillingSubscription(userId);
  const now = Date.now();
  return subscription.subscriptionItems.some((item) => entitlesToPro(item, now));
}

export async function POST(request: NextRequest) {
  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    console.error("Clerk webhook signature verification failed", error);
    return new Response("Webhook verification failed", { status: 400 });
  }

  const service = createServiceClient();

  // The payer on a user-type subscription carries the Clerk user id (project.md §9 Webhook).
  if (event.type === "subscriptionItem.active" && event.data.plan?.slug === PRO_PLAN_SLUG) {
    const userId = event.data.payer?.user_id;
    if (userId) {
      let active: boolean;
      try {
        active = await proIsActiveNow(userId);
      } catch (error) {
        // Can't confirm right now: change nothing, and let Svix retry the delivery later.
        console.error("Couldn't confirm the Pro subscription with Clerk", error);
        return new Response("Subscription check failed", { status: 500 });
      }
      // Svix delivers at least once: only a real free → pro change counts as an upgrade.
      if (active && (await setPlan(service, userId, "pro"))) captureServerEvent(userId, "upgraded", { plan: "pro" });
    }
  } else if (event.type === "subscriptionItem.ended" && event.data.plan?.slug === PRO_PLAN_SLUG) {
    // Not "canceled": Clerk keeps Pro access through the paid period after a cancellation
    // request, so only the subscription actually ending should downgrade the account.
    const userId = event.data.payer?.user_id;
    if (userId) await setPlan(service, userId, "free");
  }

  return Response.json({ received: true });
}
