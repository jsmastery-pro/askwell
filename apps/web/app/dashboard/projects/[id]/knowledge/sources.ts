// A project's knowledge sources for the knowledge page, read with the owner
// client: RLS returns only sources in the caller's own projects (§9 "Tenant
// leak"), so the project filter here only picks one of their projects.
import "server-only";
import { KNOWLEDGE_SOURCE_STATUSES, KNOWLEDGE_SOURCE_TYPES, type KnowledgeSource } from "@askwell/shared";
import { createOwnerClient } from "../../../../../lib/supabase/owner";

export class KnowledgeListError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "KnowledgeListError";
  }
}

const SOURCE_COLUMNS = "id, project_id, title, type, storage_key, status, created_at";

type SourceRow = Omit<KnowledgeSource, "type" | "status"> & { type: string; status: string };

const isType = (value: string): value is KnowledgeSource["type"] =>
  (KNOWLEDGE_SOURCE_TYPES as readonly string[]).includes(value);
const isStatus = (value: string): value is KnowledgeSource["status"] =>
  (KNOWLEDGE_SOURCE_STATUSES as readonly string[]).includes(value);

/** Narrows the text columns (check constraints in the database) to the shared enums. */
export function parseSource(row: SourceRow): KnowledgeSource {
  if (!isType(row.type) || !isStatus(row.status)) {
    throw new KnowledgeListError(`Unknown source type or status: ${row.type} / ${row.status}.`);
  }
  return { ...row, type: row.type, status: row.status };
}

/** The project's sources, newest first. */
export async function listOwnSources(projectId: string): Promise<KnowledgeSource[]> {
  const owner = await createOwnerClient();
  const { data, error } = await owner
    .from("knowledge_sources")
    .select(SOURCE_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw new KnowledgeListError("Couldn't list the knowledge sources.", { cause: error });
  return data.map(parseSource);
}
