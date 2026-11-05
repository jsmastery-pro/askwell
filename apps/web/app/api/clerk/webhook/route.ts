// POST /api/clerk/webhook: Clerk Billing events keep accounts.plan in sync
// (project.md §6.10, §8 System, §9 "Webhook").
//
// 1. The signature is verified first (verifyWebhook reads
//    CLERK_WEBHOOK_SIGNING_SECRET). Bad or missing → 400 invalid_signature,
//    before anything else runs.
// 2. Only events about the `pro` plan, paid by a user, matter; the rest get 200.
// 3. The plan comes from the user's current subscription in Clerk, not from
//    the event, so late, repeated or out-of-order events settle correctly.
// 4. The service client writes accounts.plan (owners can't). A failure → 500,
//    so Clerk (Svix) retries.
// Public in the proxy (lib/auth/routes.ts); no session, no CORS.
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { API_ERROR_STATUS, clerkWebhookBody, type ClerkWebhookResponse } from "@askwell/shared";
import { serverEvent } from "../../../../lib/analytics/events";
import { captureServerEvent } from "../../../../lib/analytics/server";
import { jsonError } from "../../../../lib/api/errors";
import { currentPlan, proEventUserId, storePlan } from "../../../../lib/billing/plan-sync";

const received = () => Response.json({ received: true } satisfies ClerkWebhookResponse);

export async function POST(request: NextRequest): Promise<Response> {
  let event: unknown;
  try {
    event = await verifyWebhook(request);
  } catch {
    return jsonError(API_ERROR_STATUS.invalid_signature, "invalid_signature", "Invalid webhook signature.");
  }

  const parsed = clerkWebhookBody.safeParse(event);
  if (!parsed.success) {
    // Signed by Clerk but not a shape we read: nothing to sync. 200, so it isn't retried forever.
    console.warn("POST /api/clerk/webhook: ignored an event with an unexpected shape");
    return received();
  }

  const userId = proEventUserId(parsed.data);
  if (!userId) return received();

  try {
    const plan = await currentPlan(userId);
    const previous = await storePlan(userId, plan);
    if (previous === "free" && plan === "pro") {
      captureServerEvent(serverEvent(userId, "upgraded", { plan, previous_plan: previous }));
    }
    return received();
  } catch (error) {
    console.error("POST /api/clerk/webhook failed", error);
    return jsonError(API_ERROR_STATUS.internal, "internal", "Something went wrong. Try again.");
  }
}
