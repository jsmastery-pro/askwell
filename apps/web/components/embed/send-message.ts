// Sends a visitor message and returns the bot's reply (POST /api/widget/chat,
// project.md §8). Phase 2: a mock that answers after ~800 ms. Phase 3 replaces
// only sendMessage() with the real request; the panel doesn't change.
import {
  widgetChatBody,
  type ApiErrorCode,
  type WidgetChatBody,
  type WidgetChatResponse,
} from "@askwell/shared";

/** A failed chat request, with the API error code (§8 error shape). */
export class ChatError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ChatError";
    this.code = code;
  }
}

export const MOCK_REPLY = "Thanks! This is a preview reply — real answers arrive soon.";
export const MOCK_REPLY_DELAY_MS = 800;

// Test hook: the next mock call fails with this code (rate_limited, quota_exceeded…).
let nextFailure: ApiErrorCode | null = null;

/** Makes the next sendMessage() call fail with `code` (tests and previews of error states). */
export function failNextMockMessage(code: ApiErrorCode | null): void {
  nextFailure = code;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The reply to `body.message`. On the first message (no conversationId) the
 * response carries a new conversation ID; send it back on the next messages.
 * Throws ChatError on failure.
 */
export async function sendMessage(body: WidgetChatBody): Promise<WidgetChatResponse> {
  const parsed = widgetChatBody.safeParse(body);
  if (!parsed.success) throw new ChatError("validation_failed", "Check your message and try again.");

  await wait(MOCK_REPLY_DELAY_MS);

  const failure = nextFailure;
  nextFailure = null;
  if (failure) throw new ChatError(failure, `Mock failure: ${failure}`);

  return {
    conversationId: parsed.data.conversationId ?? crypto.randomUUID(),
    reply: MOCK_REPLY,
  };
}
