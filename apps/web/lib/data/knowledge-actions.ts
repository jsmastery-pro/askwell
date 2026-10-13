import {
  KNOWLEDGE_FILE_TYPES,
  type AddKnowledgeResponse,
  type AddTextKnowledgeRequest,
  type DeleteKnowledgeResponse,
  type KnowledgeSource,
} from "@askwell/shared";
import { demoDelay } from "./demo";

// Client-callable writes. No database imports, so client components can use them.

// MOCK: replace with POST /api/projects/:id/knowledge, JSON body (P3-T02).
export async function addTextKnowledge(
  projectId: string,
  request: AddTextKnowledgeRequest,
): Promise<AddKnowledgeResponse> {
  void projectId;
  await demoDelay();
  return {
    source: {
      id: crypto.randomUUID(),
      title: request.title,
      type: "text",
      status: "processing",
      createdAt: new Date().toISOString(),
    },
  };
}

// MOCK: replace with POST /api/projects/:id/knowledge, multipart file upload (P3-T02).
export async function addFileKnowledge(
  projectId: string,
  file: File,
  title?: string,
): Promise<AddKnowledgeResponse> {
  void projectId;
  await demoDelay();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = KNOWLEDGE_FILE_TYPES[extension as keyof typeof KNOWLEDGE_FILE_TYPES] ?? "txt";
  return {
    source: {
      id: crypto.randomUUID(),
      title: title?.trim() || file.name,
      type,
      status: "processing",
      createdAt: new Date().toISOString(),
    },
  };
}

// There's no retry route in project.md §8 yet; the real one re-runs ingest for the source.
// MOCK: replace with a re-ingest route if P3-T02 adds one, otherwise remove "Try again".
export async function retryKnowledgeSource(source: KnowledgeSource): Promise<AddKnowledgeResponse> {
  await demoDelay();
  return { source: { ...source, status: "processing" } };
}

// MOCK: replace with DELETE /api/knowledge/:id (P3-T03).
export async function deleteKnowledgeSource(sourceId: string): Promise<DeleteKnowledgeResponse> {
  void sourceId;
  await demoDelay();
  return { ok: true };
}
