import "server-only";
import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import type { KnowledgeSource } from "@askwell/shared";
import { countProjectKnowledgeFiles, listProjectKnowledgeSources, toKnowledgeSource } from "../knowledge";
import { isUuid } from "./ids";

// Real reads. The caller (a server component) has already checked ownership via
// getOwnedProject before calling these with the project's id.

// Newest first.
export async function listKnowledgeSources(projectId: string, database: Database = defaultDb): Promise<KnowledgeSource[]> {
  if (!isUuid(projectId)) return [];
  const rows = await listProjectKnowledgeSources(projectId, database);
  return rows.map(toKnowledgeSource);
}

// Uploaded files count toward the plan's file limit; pasted text doesn't (project.md §6.4).
export async function countKnowledgeFiles(projectId: string, database: Database = defaultDb): Promise<number> {
  if (!isUuid(projectId)) return 0;
  return countProjectKnowledgeFiles(projectId, database);
}
