// The service client: supabase-js with the secret key. It acts as
// service_role and SKIPS RLS (project.md §7, §11).
//
// §9 "Tenant leak": use it only AFTER the route has checked ownership
// (getOwnedProject) or for writes owners can't make (visitor routes, the Clerk
// webhook, knowledge processing, Storage). Never use it for owner reads with a
// manual owner filter; owner reads go through createOwnerClient().
//
// This is the ONLY file that reads SUPABASE_SECRET_KEY. "server-only" makes
// any client-bundle import a build error, and a lint rule bans the key and
// this module everywhere else that matters ("use client" files, apps/widget).
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { requireEnv, supabasePublicEnv } from "./env";

export type ServiceClient = SupabaseClient<Database>;

/** A supabase-js client with the secret key (service_role), typed with `Database`. Server only. */
export function createServiceClient(): ServiceClient {
  const { url } = supabasePublicEnv();
  const secretKey = requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);

  return createClient<Database>(url, secretKey, {
    // No user session: never store, refresh or pick one up from a URL.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
