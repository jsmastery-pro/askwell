// Messages between the widget loader (on the host page) and the embed panel
// (in the iframe), sent with postMessage (project.md §6.5, §9 "postMessage").
//
// Both sides send only to the other side's exact origin, never "*", and
// accept a message only when event.origin matches AND isEmbedMessage() passes.
import { z } from "zod";

/** The panel asks the loader to close it. */
export type EmbedCloseMessage = { type: "askwell:close" };
/** The panel's content wants this height, in CSS pixels. */
export type EmbedResizeMessage = { type: "askwell:resize"; height: number };
/** Replies the visitor hasn't seen yet (0 clears the count). */
export type EmbedUnreadMessage = { type: "askwell:unread"; count: number };

export type EmbedMessage = EmbedCloseMessage | EmbedResizeMessage | EmbedUnreadMessage;
export type EmbedMessageType = EmbedMessage["type"];

/** Upper bound for a resize, so a bad value can't blow up the host layout. */
export const EMBED_MAX_HEIGHT = 10_000;

const embedMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("askwell:close") }),
  z.strictObject({
    type: z.literal("askwell:resize"),
    height: z.number().min(0).max(EMBED_MAX_HEIGHT),
  }),
  z.strictObject({
    type: z.literal("askwell:unread"),
    count: z.int().min(0),
  }),
]) satisfies z.ZodType<EmbedMessage>;

/**
 * True only for an exact EmbedMessage: a known type, the right fields with
 * valid values, and nothing else. Use it on every received `event.data`.
 */
export function isEmbedMessage(data: unknown): data is EmbedMessage {
  return embedMessageSchema.safeParse(data).success;
}
