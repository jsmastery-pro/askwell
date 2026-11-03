// Messages from the panel iframe (project.md §6.5, §9 "postMessage").
// A copy of `isEmbedMessage` from packages/shared/src/embed.ts without zod
// (5 kb budget); messages.test.ts checks both agree.
import type { EmbedMessage } from "@askwell/shared";

export const EMBED_MAX_HEIGHT = 10_000;

// Arrays and other objects have no valid `type`, so they fall to `default`.
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

// Every required field is checked by value below, so counting the keys is
// enough to reject extra ones.
const keyCount = (v: object) => Object.keys(v).length;

/** True only for an exact EmbedMessage (known type, valid fields, nothing else). */
export function isEmbedMessage(data: unknown): data is EmbedMessage {
  if (!isObject(data)) return false;
  switch (data.type) {
    case "askwell:close":
      return keyCount(data) === 1;
    case "askwell:resize":
      return (
        keyCount(data) === 2 &&
        typeof data.height === "number" &&
        data.height >= 0 &&
        data.height <= EMBED_MAX_HEIGHT
      );
    case "askwell:unread":
      return (
        keyCount(data) === 2 &&
        typeof data.count === "number" &&
        Number.isInteger(data.count) &&
        data.count >= 0
      );
    default:
      return false;
  }
}

/**
 * The message, if it comes from our panel: the exact base origin, our
 * iframe's window, and a valid shape. Otherwise null.
 */
export function acceptMessage(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  baseOrigin: string,
  frameWindow: unknown,
): EmbedMessage | null {
  if (event.origin !== baseOrigin) return null;
  if (!frameWindow || event.source !== frameWindow) return null;
  return isEmbedMessage(event.data) ? event.data : null;
}

/** Panel height limits (desktop): never taller than the panel, never tiny. */
export const MIN_PANEL_HEIGHT = 48;
export const MAX_PANEL_HEIGHT = 600;

export function clampHeight(height: number): number {
  return Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, Math.round(height)));
}
