import "server-only";
import type { Plan } from "@askwell/shared";
import { createOwnerClient, type OwnerClient } from "../supabase/owner";
import { unwrap } from "../supabase/query";

// Real: the plan is always read on the server (project.md §9). RLS returns only the signed-in
// owner's account row; no row yet means free.
export async function getAccountPlan(client: OwnerClient = createOwnerClient()): Promise<Plan> {
  const account = unwrap(await client.from("accounts").select("plan").maybeSingle());
  return account?.plan ?? "free";
}
