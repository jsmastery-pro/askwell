import "server-only";
import type { ConversationSummary, GetConversationResponse } from "@askwell/shared";
import { getConversationById, listProjectConversations } from "../conversations";
import { createOwnerClient, type OwnerClient } from "../supabase/owner";
import { isoTimestamp } from "../supabase/query";
import { isUuid } from "./ids";

type Thread = GetConversationResponse["conversation"];

// Real reads through the owner client: RLS hides other owners' conversations.

// Newest first.
export async function listConversations(projectId: string, client: OwnerClient = createOwnerClient()): Promise<ConversationSummary[]> {
  if (!isUuid(projectId)) return [];
  return listProjectConversations(projectId, client);
}

// Null for an unknown ID, a malformed ID, another owner's conversation, or one from another project.
export async function getConversation(
  projectId: string,
  conversationId: string,
  client: OwnerClient = createOwnerClient(),
): Promise<Thread | null> {
  if (!isUuid(projectId) || !isUuid(conversationId)) return null;
  const conversation = await getConversationById(conversationId, client);
  if (!conversation || conversation.project_id !== projectId) return null;
  return toThread(conversation);
}

export function toThread(conversation: NonNullable<Awaited<ReturnType<typeof getConversationById>>>): Thread {
  return {
    id: conversation.id,
    visitorId: conversation.visitor_id,
    createdAt: isoTimestamp(conversation.created_at),
    messages: conversation.messages,
  };
}
