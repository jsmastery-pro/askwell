// The owner client: supabase-js acting as the signed-in owner (project.md §3,
// §7). It sends the owner's Clerk session token, so Postgres RLS scopes every
// query to their own rows. Owner reads go through this client, never through
// the service client with a manual owner filter (§9 "Tenant leak").
import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import type { ApiErrorCode } from "@askwell/shared";
import { supabasePublicEnv } from "./env";

export type OwnerClient = SupabaseClient<Database>;

/**
 * There is no Clerk session (or it has no token). Routes turn this into a 401
 * (`unauthorizedResponse()` in lib/auth/responses).
 */
export class UnauthorizedError extends Error {
  readonly code = "unauthorized" satisfies ApiErrorCode;

  constructor(message = "Sign in to use this route.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * A supabase-js client for the signed-in owner, typed with `Database`. Server
 * only. Throws UnauthorizedError when there's no session, so it never queries
 * as anon.
 */
export async function createOwnerClient(): Promise<OwnerClient> {
  const { isAuthenticated, getToken } = await auth();
  if (!isAuthenticated || !(await getToken())) throw new UnauthorizedError();

  const { url, publishableKey } = supabasePublicEnv();

  return createClient<Database>(url, publishableKey, {
    // Supabase third-party auth (Clerk): every request carries a fresh Clerk
    // session token. Clerk caches and refreshes it. If it's gone mid-request,
    // throw rather than return null, which would fall back to the anon role.
    accessToken: async () => {
      const token = await getToken();
      if (!token) throw new UnauthorizedError();
      return token;
    },
  });
}
