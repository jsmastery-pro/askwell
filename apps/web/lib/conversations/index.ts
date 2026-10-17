import "server-only";
import { conversations, messages } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import type { ConversationSummary, Message } from "@askwell/shared";
import { asc, count, desc, eq, sql } from "drizzle-orm";

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type ConversationWithMessages = ConversationRow & { messages: Message[] };

// Same shape check as getOwnedProject in packages/db: a malformed id would make Postgres
// throw on the uuid cast, so callers treat it as "not found" instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toMessage(row: MessageRow): Message {
  return { id: row.id, role: row.role, body: row.body, createdAt: row.createdAt.toISOString() };
}

// Correlated subquery: the body of a conversation's earliest visitor message, or null.
// Independent of the outer join, so it's correct even for a conversation with no messages.
const previewColumn = sql<string | null>`(
  select ${messages.body}
  from ${messages}
  where ${messages.conversationId} = ${conversations.id} and ${messages.role} = 'visitor'
  order by ${messages.createdAt} asc
  limit 1
)`;

/**
 * A project's conversations, newest first, with each one's message count and the body of its
 * first visitor message (the preview), aggregated in SQL rather than loading every message.
 * The caller is trusted to have already checked ownership.
 */
export async function listProjectConversations(
  projectId: string,
  database: Database = defaultDb,
): Promise<ConversationSummary[]> {
  const rows = await database
    .select({
      id: conversations.id,
      visitorId: conversations.visitorId,
      createdAt: conversations.createdAt,
      messageCount: count(messages.id),
      preview: previewColumn,
    })
    .from(conversations)
    .leftJoin(messages, eq(messages.conversationId, conversations.id))
    .where(eq(conversations.projectId, projectId))
    .groupBy(conversations.id)
    .orderBy(desc(conversations.createdAt));

  return rows.map((row) => ({
    id: row.id,
    visitorId: row.visitorId,
    preview: row.preview ?? "",
    messageCount: row.messageCount,
    createdAt: row.createdAt.toISOString(),
  }));
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
