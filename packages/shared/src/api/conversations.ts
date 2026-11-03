// Owner routes: conversations (project.md §8, §6.7).
import type { Conversation, Message } from "../models";

/** A list row: the conversation plus its first message and count. */
export type ConversationSummary = Conversation & {
  /** First visitor message, or null if there is none yet. */
  preview: string | null;
  message_count: number;
};

// GET /api/projects/:id/conversations (params: idParams). Newest first.
export type ListConversationsResponse = { conversations: ConversationSummary[] };

// GET /api/conversations/:id (params: idParams). Messages oldest first.
export type GetConversationResponse = {
  conversation: Conversation;
  messages: Message[];
};
