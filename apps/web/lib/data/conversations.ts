import "server-only";
import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import type { ConversationSummary, GetConversationResponse } from "@askwell/shared";
import { getConversationById, listProjectConversations } from "../conversations";
import { isUuid } from "./ids";

type Thread = GetConversationResponse["conversation"];

// Real reads. The caller (a server component) has already checked ownership via
// getOwnedProject before calling these with the project's id.

// Newest first.
export async function listConversations(projectId: string, database: Database = defaultDb): Promise<ConversationSummary[]> {
  if (!isUuid(projectId)) return [];
  return listProjectConversations(projectId, database);
}

// Null for an unknown ID, a malformed ID, or a conversation from another project.
export async function getConversation(
  projectId: string,
  conversationId: string,
  database: Database = defaultDb,
): Promise<Thread | null> {
  if (!isUuid(projectId) || !isUuid(conversationId)) return null;
  const conversation = await getConversationById(conversationId, database);
  if (!conversation || conversation.projectId !== projectId) return null;
  return {
    id: conversation.id,
    visitorId: conversation.visitorId,
    createdAt: conversation.createdAt.toISOString(),
    messages: conversation.messages,
  };
}
