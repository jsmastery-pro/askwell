import { accounts } from "@askwell/db";
import { db } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import { captureServerEvent } from "../../lib/posthog/server";

/** Creates the account row on first sign-in. True only when this call actually created it. */
export async function ensureAccount(clerkUserId: string, database: Database = db): Promise<boolean> {
  const inserted = await database
    .insert(accounts)
    .values({ clerkUserId, plan: "free" })
    .onConflictDoNothing({ target: accounts.clerkUserId })
    .returning({ clerkUserId: accounts.clerkUserId });
  const created = inserted.length > 0;
  if (created) captureServerEvent(clerkUserId, "signed_up");
  return created;
}
