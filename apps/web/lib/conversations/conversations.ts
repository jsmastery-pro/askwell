// Conversations for the owner routes (project.md §6.7, §8). Every read goes
// through the owner client, so RLS scopes it to the caller's own projects
// (§9 "Tenant leak"): there is no service client here and no owner filter.
// No aggregates (§9 "Database API") and no new SQL function (§7): previews
// and counts are computed here from one messages query.
import "server-only";
import {
  CONVERSATIONS_PAGE_SIZE,
  encodeConversationCursor,
  MESSAGE_ROLES,
  type Conversation,
  type ConversationCursor,
  type ConversationSummary,
  type Message,
} from "@askwell/shared";
import { createOwnerClient, type OwnerClient } from "../supabase/owner";

/** A Supabase read failed; `cause` is the supabase-js error. */
export class ConversationReadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConversationReadError";
  }
}

/**
 * Rows per messages request. PostgREST caps a response at its max-rows
 * (1,000 on Supabase), so longer reads page with .range() until the exact
 * count is reached; a cap below this only means more pages.
 */
export const MESSAGES_PAGE_ROWS = 1000;

const CONVERSATION_COLUMNS = "id, project_id, visitor_id, created_at";
const MESSAGE_COLUMNS = "id, conversation_id, role, body, created_at";

type MessageRow = Omit<Message, "role"> & { role: string };

/** Narrows `role` (text with a check constraint) to the shared enum. */
export function toMessage(row: MessageRow): Message {
  const role = MESSAGE_ROLES.find((r) => r === row.role);
  if (!role) throw new ConversationReadError(`Unknown message role: ${row.role}.`);
  return { ...row, role };
}

/**
 * Every row a messages query matches, oldest first within each conversation,
 * paged past PostgREST's max-rows. `build` makes a fresh query each time.
 */
async function readAllMessages<Row>(
  build: () => {
    range: (from: number, to: number) => PromiseLike<{ data: Row[] | null; count: number | null; error: unknown }>;
  },
): Promise<Row[]> {
  const rows: Row[] = [];
  for (;;) {
    const { data, count, error } = await build().range(rows.length, rows.length + MESSAGES_PAGE_ROWS - 1);
    if (error) throw new ConversationReadError("Couldn't read the messages.", { cause: error });
    rows.push(...(data ?? []));
    // Done at the exact total, or if a page came back empty (nothing more to read).
    if (!data?.length || count === null || rows.length >= count) return rows;
  }
}

/** Keyset filter for "strictly before the cursor" on (created_at desc, id desc). */
export function beforeFilter(cursor: ConversationCursor): string {
  // The cursor was validated by the shared schema (an ISO timestamp and a
  // uuid), and the values are double-quoted, so they can't break out of the
  // PostgREST logic tree.
  const at = `"${cursor.created_at}"`;
  const id = `"${cursor.id}"`;
  return `created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`;
}

/**
 * One page of the project's conversations, newest first, with each one's
 * preview (first visitor message) and message count. `projectId` must be one
 * of the caller's projects (the route checks with getOwnedProject first); RLS
 * would return nothing otherwise.
 */
export async function listOwnConversations(
  projectId: string,
  before?: ConversationCursor,
): Promise<{ conversations: ConversationSummary[]; nextCursor: string | null }> {
  const owner = await createOwnerClient();

  let query = owner.from("conversations").select(CONVERSATION_COLUMNS).eq("project_id", projectId);
  if (before) query = query.or(beforeFilter(before));
  // One extra row tells whether an older page exists.
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(CONVERSATIONS_PAGE_SIZE + 1);
  if (error) throw new ConversationReadError("Couldn't list the conversations.", { cause: error });

  const page: Conversation[] = data.slice(0, CONVERSATIONS_PAGE_SIZE);
  const last = page.at(-1);
  const nextCursor = data.length > CONVERSATIONS_PAGE_SIZE && last ? encodeConversationCursor(last) : null;
  if (page.length === 0) return { conversations: [], nextCursor: null };

  const stats = await messageStats(
    owner,
    page.map((c) => c.id),
  );
  const conversations = page.map((c) => ({
    ...c,
    preview: stats.get(c.id)?.preview ?? null,
    message_count: stats.get(c.id)?.count ?? 0,
  }));
  return { conversations, nextCursor };
}

/** Per conversation: its message count and first visitor message, from one (paged) .in() query. */
async function messageStats(
  owner: OwnerClient,
  conversationIds: string[],
): Promise<Map<string, { count: number; preview: string | null }>> {
  const rows = await readAllMessages(() =>
    owner
      .from("messages")
      .select("conversation_id, role, body", { count: "exact" })
      .in("conversation_id", conversationIds)
      .order("conversation_id", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  );
  const stats = new Map<string, { count: number; preview: string | null }>();
  for (const row of rows) {
    const entry = stats.get(row.conversation_id) ?? { count: 0, preview: null };
    entry.count += 1;
    if (entry.preview === null && row.role === "visitor") entry.preview = row.body;
    stats.set(row.conversation_id, entry);
  }
  return stats;
}

/** The caller's conversation with its messages, oldest first, or null (unknown or another owner's). */
export async function getOwnConversation(
  id: string,
): Promise<{ conversation: Conversation; messages: Message[] } | null> {
  const owner = await createOwnerClient();
  const { data: conversation, error } = await owner
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ConversationReadError("Couldn't read the conversation.", { cause: error });
  if (!conversation) return null;

  const rows = await readAllMessages(() =>
    owner
      .from("messages")
      .select(MESSAGE_COLUMNS, { count: "exact" })
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  );
  return { conversation, messages: rows.map(toMessage) };
}
