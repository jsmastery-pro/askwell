import "server-only";
import { accounts } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import type { Plan } from "@askwell/shared";
import { eq } from "drizzle-orm";

// Real: the plan is always read on the server (project.md §9).
export async function getAccountPlan(ownerId: string, database: Database = defaultDb): Promise<Plan> {
  const [account] = await database
    .select({ plan: accounts.plan })
    .from(accounts)
    .where(eq(accounts.clerkUserId, ownerId))
    .limit(1);
  return account?.plan ?? "free";
}
