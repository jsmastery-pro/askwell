import { accounts } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import type { Plan } from "@askwell/shared";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function setPlan(clerkUserId: string, plan: Plan): Promise<void> {
  await defaultDb.update(accounts).set({ plan }).where(eq(accounts.clerkUserId, clerkUserId));
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
  if (event.type === "subscriptionItem.active") {
    const userId = event.data.payer?.user_id;
    if (userId) await setPlan(userId, "pro");
  } else if (event.type === "subscriptionItem.canceled" || event.type === "subscriptionItem.ended") {
    const userId = event.data.payer?.user_id;
    if (userId) await setPlan(userId, "free");
  }

  return Response.json({ received: true });
}
