import "server-only";
import { conversations, messages } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import type { ConversationSummary, Message } from "@askwell/shared";
import { asc, desc, eq, inArray } from "drizzle-orm";

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type ConversationWithMessages = ConversationRow & { messages: Message[] };

// Same shape check as getOwnedProject in packages/db: a malformed id would make Postgres
// throw on the uuid cast, so callers treat it as "not found" instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toMessage(row: MessageRow): Message {
  return { id: row.id, role: row.role, body: row.body, createdAt: row.createdAt.toISOString() };
}

/**
 * A project's conversations, newest first, with each one's message count and the body of its
 * first visitor message (the preview). The caller is trusted to have already checked ownership.
 */
export async function listProjectConversations(
  projectId: string,
  database: Database = defaultDb,
): Promise<ConversationSummary[]> {
  const convRows = await database
    .select()
    .from(conversations)
    .where(eq(conversations.projectId, projectId))
    .orderBy(desc(conversations.createdAt));
  if (convRows.length === 0) return [];

  const msgRows = await database
    .select()
    .from(messages)
    .where(inArray(messages.conversationId, convRows.map((c) => c.id)))
    .orderBy(asc(messages.createdAt));

  const byConversation = new Map<string, MessageRow[]>();
  for (const message of msgRows) {
    const list = byConversation.get(message.conversationId) ?? [];
    list.push(message);
    byConversation.set(message.conversationId, list);
  }

  return convRows.map((conversation) => {
    const its = byConversation.get(conversation.id) ?? [];
    return {
      id: conversation.id,
      visitorId: conversation.visitorId,
      preview: its.find((m) => m.role === "visitor")?.body ?? "",
      messageCount: its.length,
      createdAt: conversation.createdAt.toISOString(),
    };
  });
}

/** A conversation with its full message history, or `null` if it doesn't exist. Doesn't check ownership. */
export async function getConversationById(
  conversationId: string,
  database: Database = defaultDb,
): Promise<ConversationWithMessages | null> {
  if (!UUID_RE.test(conversationId)) return null;

  const [conversation] = await database.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conversation) return null;

  const msgRows = await database
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.createdAt));

  return { ...conversation, messages: msgRows.map(toMessage) };
}
