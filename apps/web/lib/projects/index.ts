import "server-only";
import type { Tables } from "@askwell/db/types";
import { PLAN_LIMITS, type Project } from "@askwell/shared";
import { randomBytes } from "node:crypto";
import { ensureAccount } from "../../app/dashboard/account";
import { getAccountPlan } from "../data/billing";
import { isUuid } from "../data/ids";
import { captureServerEvent } from "../posthog/server";
import { createOwnerClient, type OwnerClient } from "../supabase/owner";
import { isoTimestamp, SupabaseQueryError, unwrap } from "../supabase/query";
import { createServiceClient, type ServiceClient } from "../supabase/service";

// Owner reads and writes go through the owner client, so RLS decides what's theirs: another
// owner's project reads as missing, and renaming or deleting it touches no row. Creating one
// checks the plan's project limit, so it goes through create_project with the service client.

export type ProjectRow = Tables<"projects">;

/** `pk_` + 24 random bytes, base64url (URL-safe, 32 chars). */
export function generatePublicKey(): string {
  return `pk_${randomBytes(24).toString("base64url")}`;
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    publicKey: row.public_key,
    messagesUsed: row.messages_used,
    periodStart: isoTimestamp(row.period_start),
    createdAt: isoTimestamp(row.created_at),
  };
}

/** The signed-in owner's project, or null if it doesn't exist, isn't theirs, or the ID is malformed. */
export async function getOwnedProject(id: string, client: OwnerClient = createOwnerClient()): Promise<ProjectRow | null> {
  if (!isUuid(id)) return null;
  return unwrap(await client.from("projects").select("*").eq("id", id).maybeSingle());
}

/** The signed-in owner's projects, oldest first. Plans allow at most a handful, well under one page. */
export async function listProjects(client: OwnerClient = createOwnerClient()): Promise<ProjectRow[]> {
  return unwrap(await client.from("projects").select("*").order("created_at", { ascending: true })) ?? [];
}

export type CreateProjectResult =
  | { ok: true; project: ProjectRow }
  | { ok: false; reason: "plan_limit"; limit: number };

/**
 * Creates a project and its default widget config, if the owner's plan allows. The plan is read
 * on the server and its limit passed to create_project, which locks the account row so two
 * concurrent creates can't both pass the count.
 */
export async function createProject(
  ownerId: string,
  name: string,
  { owner = createOwnerClient(), service = createServiceClient() }: { owner?: OwnerClient; service?: ServiceClient } = {},
): Promise<CreateProjectResult> {
  // The dashboard creates the account on first visit; an API call may come first.
  await ensureAccount(ownerId, service);
  const limit = PLAN_LIMITS[await getAccountPlan(owner)].projects;

  const { data, error } = await service.rpc("create_project", {
    p_owner_id: ownerId,
    p_name: name,
    p_public_key: generatePublicKey(),
    p_project_limit: limit,
  });
  if (error?.code === "AWLIM") return { ok: false, reason: "plan_limit", limit };
  if (error) throw new SupabaseQueryError(error);
  // After commit, so a refused create is never counted.
  captureServerEvent(ownerId, "project_created", { project_id: data.id });
  return { ok: true, project: data };
}

/** Renames the signed-in owner's project. Null if it doesn't exist or isn't theirs. */
export async function renameProject(
  id: string,
  name: string,
  client: OwnerClient = createOwnerClient(),
): Promise<ProjectRow | null> {
  if (!isUuid(id)) return null;
  return unwrap(await client.from("projects").update({ name }).eq("id", id).select("*").maybeSingle());
}

/**
 * Hard-deletes the signed-in owner's project. Its config, sources, chunks and conversations
 * cascade in the database; its files in Storage don't, so their keys are read first and the
 * objects removed after the row is gone. False if it doesn't exist or isn't theirs.
 */
export async function deleteProject(
  id: string,
  { owner = createOwnerClient(), service = createServiceClient() }: { owner?: OwnerClient; service?: ServiceClient } = {},
): Promise<boolean> {
  if (!isUuid(id)) return false;
  // Plans cap sources per project at a few dozen, well under one page.
  const sources = unwrap(
    await owner.from("knowledge_sources").select("storage_key").eq("project_id", id).not("storage_key", "is", null),
  );
  const deleted = unwrap(await owner.from("projects").delete().eq("id", id).select("id"));
  if (!deleted?.length) return false;

  // The row goes first: a storage failure then only orphans files, never leaves a project whose
  // files are gone (the same order as deleting one knowledge source).
  const keys = (sources ?? []).flatMap((source) => (source.storage_key ? [source.storage_key] : []));
  if (keys.length > 0) await removeProjectFiles(id, keys, service);
  return true;
}

async function removeProjectFiles(projectId: string, keys: string[], service: ServiceClient): Promise<void> {
  const bucket = process.env.BUCKET_NAME;
  try {
    if (!bucket) throw new Error("BUCKET_NAME is not set");
    const { error } = await service.storage.from(bucket).remove(keys);
    if (error) throw error;
  } catch (error) {
    console.error(`Could not delete ${keys.length} storage object(s) of deleted project ${projectId}`, error);
  }
}
