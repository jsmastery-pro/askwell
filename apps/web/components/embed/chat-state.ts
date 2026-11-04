// The panel's chat state and send flow, kept out of React so it's testable:
// send → typing → reply (or a friendly error).
import {
  MAX_MESSAGE_LENGTH,
  type ApiErrorCode,
  type WidgetChatBody,
  type WidgetChatResponse,
} from "@askwell/shared";
import { ChatError } from "./send-message";

export interface ChatMessage {
  id: string;
  role: "visitor" | "bot";
  /** Plain text. Always rendered as text, never as HTML. */
  text: string;
}

export interface ChatState {
  messages: ChatMessage[];
  /** Waiting for a reply. */
  typing: boolean;
  conversationId: string | null;
  /** The last error, shown until the next send. */
  error: ApiErrorCode | null;
}

export type ChatAction =
  | { type: "sent"; message: ChatMessage }
  | { type: "replied"; message: ChatMessage; conversationId: string }
  | { type: "failed"; code: ApiErrorCode };

export const initialChatState: ChatState = {
  messages: [],
  typing: false,
  conversationId: null,
  error: null,
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "sent":
      return { ...state, messages: [...state.messages, action.message], typing: true, error: null };
    case "replied":
      return {
        ...state,
        messages: [...state.messages, action.message],
        typing: false,
        conversationId: action.conversationId,
      };
    case "failed":
      return {
        ...state,
        typing: false,
        error: action.code,
        // The conversation is gone (§6.6: it isn't this project's): start a new one.
        conversationId: action.code === "not_found" ? null : state.conversationId,
      };
  }
}

/** What the visitor sees for each failure. */
export function friendlyError(code: ApiErrorCode): string {
  switch (code) {
    case "rate_limited":
      return "You're sending messages too fast. Wait a moment, then try again.";
    case "quota_exceeded":
      return "This assistant has reached its limit for now. Please try again later.";
    case "validation_failed":
      return `Messages can be up to ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")} characters.`;
    case "message_blocked":
      return "This message can't be sent. Try rewording it.";
    case "not_found":
      return "This conversation has ended. Send your message again to start a new one.";
    default:
      // internal, network errors, and anything unexpected.
      return "Something went wrong. Please try again.";
  }
}

/** The trimmed message, or null if it's empty or too long to send. */
export function sendableText(raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0 || text.length > MAX_MESSAGE_LENGTH) return null;
  return text;
}

export interface SendDeps {
  key: string;
  visitorId: string;
  conversationId: string | null;
  send: (body: WidgetChatBody) => Promise<WidgetChatResponse>;
  dispatch: (action: ChatAction) => void;
  newId?: () => string;
}

/**
 * Sends one visitor message: shows it and the typing state at once, then the
 * reply, or a friendly error. Returns false if the text can't be sent.
 */
export async function sendChatMessage(raw: string, deps: SendDeps): Promise<boolean> {
  const text = sendableText(raw);
  if (text === null) return false;
  const newId = deps.newId ?? (() => crypto.randomUUID());

  deps.dispatch({ type: "sent", message: { id: newId(), role: "visitor", text } });
  try {
    const res = await deps.send({
      key: deps.key,
      visitorId: deps.visitorId,
      ...(deps.conversationId ? { conversationId: deps.conversationId } : {}),
      message: text,
    });
    deps.dispatch({
      type: "replied",
      message: { id: newId(), role: "bot", text: res.reply },
      conversationId: res.conversationId,
    });
  } catch (error) {
    deps.dispatch({ type: "failed", code: error instanceof ChatError ? error.code : "internal" });
  }
  return true;
}
