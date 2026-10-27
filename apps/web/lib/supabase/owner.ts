import "server-only";
import type { Database } from "@askwell/db/types";
import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type OwnerClient = SupabaseClient<Database>;

/**
 * A Supabase client that acts as the signed-in owner: it sends their Clerk session token, so
 * Supabase runs each query as `authenticated` with RLS scoped to `auth.jwt()->>'sub'`. Create one
 * per request (the token is read from the request's Clerk session); signed out, queries run as
 * `anon`, which sees nothing.
 */
export function createOwnerClient(): OwnerClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].filter(Boolean);
    throw new Error(`Supabase is not configured (missing ${missing.join(", ")})`);
  }
  return createClient<Database>(url, publishableKey, {
    accessToken: async () => (await auth()).getToken(),
  });
}
