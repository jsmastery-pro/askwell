import "server-only";
import type { ConversationSummary, GetConversationResponse } from "@askwell/shared";
import { MOCK_THREADS } from "../mock/conversations";

// MOCK: replace with GET /api/projects/:id/conversations, newest first (Phase 4).
export async function listConversations(projectId: string): Promise<ConversationSummary[]> {
  void projectId;
  return MOCK_THREADS.map((thread) => ({
    id: thread.id,
    visitorId: thread.visitorId,
    preview: thread.messages.find((message) => message.role === "visitor")?.body ?? "",
    messageCount: thread.messages.length,
    createdAt: thread.createdAt,
  }));
}

// MOCK: replace with GET /api/conversations/:id, scoped to the project (Phase 4).
export async function getConversation(
  projectId: string,
  conversationId: string,
): Promise<GetConversationResponse["conversation"] | null> {
  void projectId;
  return MOCK_THREADS.find((thread) => thread.id === conversationId) ?? null;
}
