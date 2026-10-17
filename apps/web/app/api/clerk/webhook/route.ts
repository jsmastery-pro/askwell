import { accounts } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import type { Plan } from "@askwell/shared";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { and, eq, ne } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { captureServerEvent } from "../../../../lib/posthog/server";

export const dynamic = "force-dynamic";

// The Clerk Billing plan slug for Pro (dashboard, test mode). Other plans' events are ignored.
const PRO_PLAN_SLUG = "pro";

/** True only when an account row actually changed plan, so a redelivered webhook is a no-op. */
async function setPlan(clerkUserId: string, plan: Plan): Promise<boolean> {
  const changed = await defaultDb
    .update(accounts)
    .set({ plan })
    .where(and(eq(accounts.clerkUserId, clerkUserId), ne(accounts.plan, plan)))
    .returning({ clerkUserId: accounts.clerkUserId });
  return changed.length > 0;
}

export async function POST(request: NextRequest) {
  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    console.error("Clerk webhook signature verification failed", error);
    return new Response("Webhook verification failed", { status: 400 });
  }

  // The payer on a user-type subscription carries the Clerk user id (project.md §9 Webhook).
  if (event.type === "subscriptionItem.active" && event.data.plan?.slug === PRO_PLAN_SLUG) {
    const userId = event.data.payer?.user_id;
    if (userId) {
      // Svix delivers at least once: only a real free → pro change counts as an upgrade.
      if (await setPlan(userId, "pro")) captureServerEvent(userId, "upgraded", { plan: "pro" });
    }
  } else if (event.type === "subscriptionItem.ended" && event.data.plan?.slug === PRO_PLAN_SLUG) {
    // Not "canceled": Clerk keeps Pro access through the paid period after a cancellation
    // request, so only the subscription actually ending should downgrade the account.
    const userId = event.data.payer?.user_id;
    if (userId) await setPlan(userId, "free");
  }

  return Response.json({ received: true });
}
