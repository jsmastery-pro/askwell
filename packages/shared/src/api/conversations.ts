// Owner routes: conversations (project.md §8, §6.7).
import { z } from "zod";
import type { Conversation, Message } from "../models";
import { idSchema } from "./common";

/** A list row: the conversation plus its first message and count. */
export type ConversationSummary = Conversation & {
  /** First visitor message, or null if there is none yet. */
  preview: string | null;
  message_count: number;
};

/**
 * Where a page of conversations ends: the last row's (created_at, id). The
 * list is ordered newest first on that pair, so the next page is every row
 * strictly before it (keyset paging: no repeats, no gaps, even when rows
 * share a created_at).
 */
export type ConversationCursor = { created_at: string; id: string };

/** A Postgres timestamptz as PostgREST returns it, e.g. "2026-11-04T18:20:32.87489+00:00". */
const cursorTimestamp = z.iso.datetime({ offset: true });
const cursorPayload = z.strictObject({ c: cursorTimestamp, i: idSchema });

/** Longest cursor accepted (the real ones are ~160 characters). */
const CURSOR_MAX_LENGTH = 400;

/**
 * Lower-case hex of the ASCII JSON '{"c":created_at,"i":id}': URL-safe, and
 * needs no browser or Node globals. Opaque to clients: send back what
 * `nextCursor` gave.
 */
export function encodeConversationCursor(cursor: ConversationCursor): string {
  const json = JSON.stringify({ c: cursor.created_at, i: cursor.id });
  return Array.from(json, (ch) => ch.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

/** The cursor in `value`, or null if it isn't one `encodeConversationCursor` made. */
export function decodeConversationCursor(value: string): ConversationCursor | null {
  if (value.length > CURSOR_MAX_LENGTH || !/^(?:[0-9a-f]{2})+$/.test(value)) return null;
  const text = (value.match(/../g) ?? []).map((pair) => String.fromCharCode(Number.parseInt(pair, 16))).join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = cursorPayload.safeParse(json);
  return parsed.success ? { created_at: parsed.data.c, id: parsed.data.i } : null;
}

// GET /api/projects/:id/conversations (params: idParams; query below).
// Newest first, CONVERSATIONS_PAGE_SIZE per page.
export const listConversationsQuery = z.strictObject({
  /** `nextCursor` from the previous page: return the conversations older than it. */
  before: z
    .string()
    .transform((value, ctx) => {
      const cursor = decodeConversationCursor(value);
      if (!cursor) {
        ctx.addIssue({ code: "custom", message: "Invalid cursor" });
        return z.NEVER;
      }
      return cursor;
    })
    .optional(),
});
export type ListConversationsQuery = z.infer<typeof listConversationsQuery>;

export type ListConversationsResponse = {
  conversations: ConversationSummary[];
  /** Pass as `before` for the next (older) page; null when there are no older conversations. */
  nextCursor: string | null;
};

// GET /api/conversations/:id (params: idParams). Messages oldest first.
export type GetConversationResponse = {
  conversation: Conversation;
  messages: Message[];
};
