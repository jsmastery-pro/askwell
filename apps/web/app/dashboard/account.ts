import { accounts } from "@askwell/db";
import { db } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";

export async function ensureAccount(clerkUserId: string, database: Database = db): Promise<void> {
  await database
    .insert(accounts)
    .values({ clerkUserId, plan: "free" })
    .onConflictDoNothing({ target: accounts.clerkUserId });
}
