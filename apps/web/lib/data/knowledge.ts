import "server-only";
import type { KnowledgeSource } from "@askwell/shared";
import { MOCK_KNOWLEDGE_SOURCES } from "../mock/knowledge";

// Newest first.
// MOCK: replace with a knowledge_sources query scoped by project (P3-T03).
export async function listKnowledgeSources(projectId: string): Promise<KnowledgeSource[]> {
  void projectId;
  return [...MOCK_KNOWLEDGE_SOURCES].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

// Uploaded files count toward the plan's file limit; pasted text doesn't (project.md §6.4).
// MOCK: replace with a count of this project's file sources (P3-T03).
export async function countKnowledgeFiles(projectId: string): Promise<number> {
  const sources = await listKnowledgeSources(projectId);
  return sources.filter((source) => source.type !== "text").length;
}
