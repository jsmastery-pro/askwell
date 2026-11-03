// The owner's `accounts` row (docs/project.md §6.2 "Account row", §7).
//
// ensureAccount() creates the row on the owner's first visit with the service
// client (owners can't insert into accounts). Reading it back goes through the
// owner client, so RLS scopes the read to the owner's own row (§9 "Tenant
// leak"): never a service-client read with a manual owner filter.
import "server-only";
import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { PLANS, type Plan } from "@askwell/shared";
import { createOwnerClient, UnauthorizedError } from "../supabase/owner";
import { createServiceClient } from "../supabase/service";

/** The account row couldn't be written or read. */
export class AccountError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AccountError";
  }
}

/**
 * Creates the signed-in owner's `accounts` row (plan `free`, the column
 * default) if it doesn't exist yet. Never changes an existing row, so a plan
 * set by the Clerk webhook is never overwritten. Safe to call on every load:
 * one `INSERT … ON CONFLICT DO NOTHING`.
 *
 * The user ID comes from Clerk's server-verified session, never from the
 * client. Throws UnauthorizedError without a session, before any write.
 *
 * @returns the owner's Clerk user ID
 */
export async function ensureAccount(): Promise<string> {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) throw new UnauthorizedError();

  const { error } = await createServiceClient()
    .from("accounts")
    .upsert({ clerk_user_id: userId }, { onConflict: "clerk_user_id", ignoreDuplicates: true });
  if (error) throw new AccountError("Couldn't create your account.", { cause: error });

  return userId;
}

/** Narrows the `plan` column (text with a check constraint) to `Plan`. */
export function parsePlan(value: string): Plan {
  const plan = PLANS.find((p) => p === value);
  if (!plan) throw new AccountError(`Unknown plan "${value}".`);
  return plan;
}

/**
 * The signed-in owner's plan, read with the owner client. RLS returns only
 * their own row, so there's no owner filter here. Throws AccountError if the
 * row isn't visible (no row yet, or the Clerk token isn't accepted).
 */
export async function getOwnPlan(): Promise<Plan> {
  const owner = await createOwnerClient();
  const { data, error } = await owner.from("accounts").select("plan").maybeSingle();
  if (error) throw new AccountError("Couldn't read your account.", { cause: error });
  if (!data) throw new AccountError("Your account row isn't visible to you.");
  return parsePlan(data.plan);
}

/**
 * ensureAccount() then getOwnPlan(), once per request (React `cache`), for
 * the dashboard layout.
 */
export const loadOwnPlan = cache(async (): Promise<Plan> => {
  await ensureAccount();
  return getOwnPlan();
});
