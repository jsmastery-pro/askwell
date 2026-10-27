import "server-only";
import type { Tables } from "@askwell/db/types";
import type { ConversationSummary, Message } from "@askwell/shared";
import { isUuid } from "../data/ids";
import { createOwnerClient, type OwnerClient } from "../supabase/owner";
import { fetchAll, isoTimestamp, unwrap } from "../supabase/query";

// Owner reads through the owner client: RLS returns only conversations (and messages) in the
// signed-in owner's projects, so another owner's conversation reads as missing.

export type ConversationRow = Tables<"conversations">;
export type ConversationWithMessages = ConversationRow & { messages: Message[] };

type MessageRow = Pick<Tables<"messages">, "id" | "role" | "body" | "created_at">;

function toMessage(row: MessageRow): Message {
  return { id: row.id, role: row.role, body: row.body, createdAt: isoTimestamp(row.created_at) };
}

/**
 * Columns for a conversation summary: its message count, and its earliest visitor message as
 * `preview` (filtered, ordered and limited on the embedded resource by `withPreview`).
 */
export const SUMMARY_COLUMNS = "message_count:messages(count), preview:messages(body)";

/** Narrows a query's `preview` embed to the conversation's first visitor message. */
export function withPreview<Q extends PreviewQuery<Q>>(query: Q): Q {
  return query
    .eq("preview.role", "visitor")
    .order("created_at", { referencedTable: "preview", ascending: true })
    .limit(1, { referencedTable: "preview" });
}

type PreviewQuery<Q> = {
  eq(column: string, value: string): Q;
  order(column: string, options: { referencedTable: string; ascending: boolean }): Q;
  limit(count: number, options: { referencedTable: string }): Q;
};

/** The preview text and message count from a row selected with SUMMARY_COLUMNS. */
export function summaryOf(row: { message_count: { count: number }[]; preview: { body: string }[] }) {
  return { messageCount: row.message_count[0]?.count ?? 0, preview: row.preview[0]?.body ?? "" };
}

/**
 * A project's conversations, newest first, with each one's message count and the body of its
 * first visitor message (the preview), counted in the database rather than loading every message.
 * Empty for another owner's project. Paged, since a busy project can outgrow one response.
 */
export async function listProjectConversations(
  projectId: string,
  client: OwnerClient = createOwnerClient(),
): Promise<ConversationSummary[]> {
  if (!isUuid(projectId)) return [];
  const rows = await fetchAll((from, to) =>
    withPreview(client.from("conversations").select(`id, visitor_id, created_at, ${SUMMARY_COLUMNS}`))
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );

  return rows.map((row) => ({
    id: row.id,
    visitorId: row.visitor_id,
    ...summaryOf(row),
    createdAt: isoTimestamp(row.created_at),
  }));
}

/**
 * A conversation with its full message history, oldest first. Null if it doesn't exist, isn't in
 * one of the signed-in owner's projects, or the ID is malformed.
 */
export async function getConversationById(
  conversationId: string,
  client: OwnerClient = createOwnerClient(),
): Promise<ConversationWithMessages | null> {
  if (!isUuid(conversationId)) return null;

  const conversation = unwrap(await client.from("conversations").select("*").eq("id", conversationId).maybeSingle());
  if (!conversation) return null;

  const messages = await fetchAll((from, to) =>
    client
      .from("messages")
      .select("id, role, body, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return { ...conversation, messages: messages.map(toMessage) };
}
