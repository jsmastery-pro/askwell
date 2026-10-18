import { ERROR_CODES, apiErrorSchema, widgetChatResponseSchema } from "@askwell/shared";
import {
  clearConversationId,
  getConversationId,
  setConversationId,
} from "../../components/widget-panel/conversation-id";
import { ReplyError } from "./reply-error";

export type ReplyContext = { key: string; visitorId: string };

async function postChat(body: { key: string; visitorId: string; message: string; conversationId?: string }) {
  const response = await fetch("/api/widget/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, ok: response.ok, json: await response.json().catch(() => null) };
}

/**
 * Asks POST /api/widget/chat for the bot's reply, continuing the stored conversation.
 * Resolves with the reply text, or throws a ReplyError (./reply-error) with the route's
 * error code. Only the code is kept: the panel never shows the route's own message.
 */
export async function getReply(message: string, { key, visitorId }: ReplyContext): Promise<string> {
  const conversationId = getConversationId(key) ?? undefined;
  let result = await postChat({ key, visitorId, message, conversationId });

  // A 404 with a stored conversation means that conversation is gone or isn't this project's.
  // Start a new one instead of leaving the visitor stuck: clear it and resend once without it.
  if (result.status === 404 && conversationId) {
    clearConversationId(key);
    result = await postChat({ key, visitorId, message });
  }

  if (!result.ok) {
    const error = apiErrorSchema.safeParse(result.json);
    throw new ReplyError(error.success ? error.data.error.code : ERROR_CODES.internal);
  }
  const reply = widgetChatResponseSchema.safeParse(result.json);
  if (!reply.success) throw new ReplyError(ERROR_CODES.internal);

  setConversationId(key, reply.data.conversationId);
  return reply.data.reply;
}

const PREVIEW_DELAY_MS = 700;

/** The Customize preview's reply: no key, no network, no message counted against the plan. */
export async function previewReply(message: string): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, PREVIEW_DELAY_MS));
  return `You asked: "${message}". This is a preview. On your site, answers come from your knowledge.`;
}
