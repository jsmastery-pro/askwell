import "server-only";
import { captureServerEvent } from "../../lib/posthog/server";
import { unwrap } from "../../lib/supabase/query";
import { createServiceClient, type ServiceClient } from "../../lib/supabase/service";

/**
 * Creates the account row on first sign-in. True only when this call actually created it.
 * Owners can't insert their own account (the plan lives on it), so this uses the service client.
 */
export async function ensureAccount(clerkUserId: string, service: ServiceClient = createServiceClient()): Promise<boolean> {
  const inserted = unwrap(
    await service
      .from("accounts")
      .upsert({ clerk_user_id: clerkUserId, plan: "free" }, { onConflict: "clerk_user_id", ignoreDuplicates: true })
      .select("clerk_user_id"),
  );
  const created = (inserted?.length ?? 0) > 0;
  if (created) captureServerEvent(clerkUserId, "signed_up");
  return created;
}
