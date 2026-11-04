// Sends a visitor message and returns the bot's reply: POST /api/widget/chat
// (project.md §8). The panel runs on our origin inside the iframe, so the
// request is same-origin.
import {
  API_ERROR_CODES,
  widgetChatBody,
  type ApiErrorCode,
  type WidgetChatBody,
  type WidgetChatResponse,
} from "@askwell/shared";

export const CHAT_ENDPOINT = "/api/widget/chat";

/**
 * Give up on a chat reply after 60 s. The route waits on Arcjet, Postgres and
 * OpenAI (30 s per attempt server-side), so this only trips on a real stall.
 */
export const CHAT_REQUEST_TIMEOUT_MS = 60_000;

/** A failed chat request, with the API error code (§8 error shape). */
export class ChatError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ChatError";
    this.code = code;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isApiErrorCode = (value: unknown): value is ApiErrorCode =>
  typeof value === "string" && (API_ERROR_CODES as readonly string[]).includes(value);

/** The ChatError for a failed response: its `{ error: { code, message } }`, else internal. */
function errorFrom(status: number, payload: unknown): ChatError {
  const error = isRecord(payload) ? payload.error : undefined;
  if (isRecord(error) && isApiErrorCode(error.code)) {
    const message = typeof error.message === "string" ? error.message : error.code;
    return new ChatError(error.code, message);
  }
  return new ChatError("internal", `Chat request failed with HTTP ${status}.`);
}

/**
 * The reply to `body.message`. On the first message (no conversationId) the
 * response carries a new conversation ID; send it back on the next messages.
 * Throws ChatError on any failure, network errors included (code internal).
 */
export async function sendMessage(body: WidgetChatBody): Promise<WidgetChatResponse> {
  const parsed = widgetChatBody.safeParse(body);
  if (!parsed.success) throw new ChatError("validation_failed", "Check your message and try again.");

  // One deadline for the request and its body, so a stalled reply can't leave
  // the panel typing forever. Aborting rejects fetch() or response.json().
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS);

  let response: Response;
  let payload: unknown;
  try {
    try {
      response = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: controller.signal,
      });
    } catch {
      throw new ChatError("internal", "Couldn't reach the chat service.");
    }
    payload = await response.json().catch(() => null);
  } finally {
    clearTimeout(timer);
  }
  if (controller.signal.aborted) {
    throw new ChatError("internal", "The chat service took too long to answer.");
  }

  if (!response.ok) throw errorFrom(response.status, payload);

  if (
    !isRecord(payload) ||
    typeof payload.conversationId !== "string" ||
    typeof payload.reply !== "string"
  ) {
    throw new ChatError("internal", "The chat service sent an unexpected response.");
  }
  return { conversationId: payload.conversationId, reply: payload.reply };
}
