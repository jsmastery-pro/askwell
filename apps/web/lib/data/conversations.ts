import "server-only";
import type { ConversationSummary, GetConversationResponse } from "@askwell/shared";
import { MOCK_OTHER_PROJECT_ID, MOCK_OTHER_PROJECT_THREAD, MOCK_THREADS } from "../mock/conversations";
import { isUuid } from "./ids";

type Thread = GetConversationResponse["conversation"];

// Demo scoping: the shared fixtures belong to whichever project asks, except the one
// thread that belongs to another project. The real queries filter by project_id.
function threadsFor(projectId: string): Thread[] {
  return projectId === MOCK_OTHER_PROJECT_ID ? [MOCK_OTHER_PROJECT_THREAD] : MOCK_THREADS;
}

// Newest first.
// MOCK: replace with GET /api/projects/:id/conversations (Phase 4).
export async function listConversations(projectId: string): Promise<ConversationSummary[]> {
  if (!isUuid(projectId)) return [];
  return threadsFor(projectId)
    .map((thread) => ({
      id: thread.id,
      visitorId: thread.visitorId,
      preview: thread.messages.find((message) => message.role === "visitor")?.body ?? "",
      messageCount: thread.messages.length,
      createdAt: thread.createdAt,
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

// Null for an unknown ID, a malformed ID, or a conversation from another project.
// MOCK: replace with GET /api/conversations/:id, scoped to the project (Phase 4).
export async function getConversation(projectId: string, conversationId: string): Promise<Thread | null> {
  if (!isUuid(projectId) || !isUuid(conversationId)) return null;
  return threadsFor(projectId).find((thread) => thread.id === conversationId) ?? null;
}
