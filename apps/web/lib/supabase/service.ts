import "server-only";
import type { Database } from "@askwell/db/types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ServiceClient = SupabaseClient<Database>;

let client: ServiceClient | undefined;

/**
 * The server's own Supabase client: the secret key, so it acts as `service_role`, which RLS
 * doesn't apply to. For writes that need a plan or limit check (SB-T03's functions), first
 * sign-in, and cleanup across a project's Storage files. Never import it from client code.
 */
export function createServiceClient(): ServiceClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !secretKey && "SUPABASE_SECRET_KEY"].filter(Boolean);
  if (!url || !secretKey) throw new Error(`Supabase is not configured (missing ${missing.join(", ")})`);
  // No user session to keep: every request carries the secret key.
  client = createClient<Database>(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
