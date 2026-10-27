import "server-only";
import type { Tables } from "@askwell/db/types";
import type { KnowledgeSource } from "@askwell/shared";
import { createOwnerClient, type OwnerClient } from "../supabase/owner";
import { isoTimestamp, unwrap } from "../supabase/query";
import { isUuid } from "./ids";

// Real reads through the owner client: another owner's project has no visible sources.

type SourceRow = Pick<Tables<"knowledge_sources">, "id" | "title" | "type" | "status" | "created_at">;

export function toKnowledgeSource(row: SourceRow): KnowledgeSource {
  return { id: row.id, title: row.title, type: row.type, status: row.status, createdAt: isoTimestamp(row.created_at) };
}

// Newest first. Plans cap sources per project at a few dozen, well under one page.
export async function listKnowledgeSources(projectId: string, client: OwnerClient = createOwnerClient()): Promise<KnowledgeSource[]> {
  if (!isUuid(projectId)) return [];
  const rows = unwrap(
    await client
      .from("knowledge_sources")
      .select("id, title, type, status, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
  );
  return (rows ?? []).map(toKnowledgeSource);
}

// Every source counts toward the plan's source limit, pasted text included (project.md §5, §6.4).
export async function countKnowledgeSources(projectId: string, client: OwnerClient = createOwnerClient()): Promise<number> {
  if (!isUuid(projectId)) return 0;
  const { count, error } = await client
    .from("knowledge_sources")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  unwrap({ data: null, error });
  return count ?? 0;
}

/** The signed-in owner's source, or null if it doesn't exist, isn't theirs, or the ID is malformed. */
export async function getOwnedKnowledgeSource(
  sourceId: string,
  client: OwnerClient = createOwnerClient(),
): Promise<Pick<Tables<"knowledge_sources">, "id" | "project_id" | "storage_key"> | null> {
  if (!isUuid(sourceId)) return null;
  return unwrap(await client.from("knowledge_sources").select("id, project_id, storage_key").eq("id", sourceId).maybeSingle());
}
