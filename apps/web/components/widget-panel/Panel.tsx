"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { APP_NAME, MAX_CHAT_MESSAGE_LENGTH, type WidgetConfig } from "@askwell/shared";
import {
  WIDGET_MESSAGE_SOURCE,
  isLoaderToPanelMessage,
  type PanelToLoaderMessage,
} from "@askwell/shared/widget-messages";
import { getReply } from "../../app/embed/reply";
import { replyFailure } from "../../app/embed/reply-error";
import { textColorOn } from "./contrast";
import { getVisitorId } from "./visitor-id";

type ChatMessage =
  | { id: number; from: "visitor" | "bot"; text: string }
  /** A failed reply. `retry` is the visitor's message to resend, for errors worth retrying. */
  | { id: number; from: "error"; text: string; retry?: string };
type NewMessage = ChatMessage extends infer M ? (M extends ChatMessage ? Omit<M, "id"> : never) : never;

const CLOSE: PanelToLoaderMessage = { source: WIDGET_MESSAGE_SOURCE, type: "close" };
const GREETING: ChatMessage = { id: 0, from: "bot", text: "Hi! Ask me anything." };
const FONT = { fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' };
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#161A24]";
// Show the counter for the last 100 characters before the limit.
const COUNTER_FROM = MAX_CHAT_MESSAGE_LENGTH - 100;

// What the visitor sees for each failure. Never the route's own error text.
const RATE_LIMITED = "You're sending messages too fast. Try again in a minute.";
const UNAVAILABLE = "This assistant is unavailable right now.";
const FAILED = "Something went wrong.";

export function Panel({ config, parentOrigin }: { config: WidgetConfig; parentOrigin: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  // Out of quota: every further message would fail too, so the input is turned off.
  const [unavailable, setUnavailable] = useState(false);
  const nextId = useRef(1);
  const unread = useRef(0);
  // Sent with each message once replies come from the chat route (Phase 3).
  const visitorId = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const brand = { background: config.buttonColor, color: textColorOn(config.buttonColor) };

  const post = useCallback(
    (message: PanelToLoaderMessage) => {
      if (parentOrigin && window.parent !== window) window.parent.postMessage(message, parentOrigin);
    },
    [parentOrigin],
  );

  useEffect(() => {
    visitorId.current = getVisitorId();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") post(CLOSE);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== parentOrigin || event.source !== window.parent) return;
      if (!isLoaderToPanelMessage(event.data)) return;
      unread.current = 0;
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onMessage);
    };
  }, [parentOrigin, post]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, typing]);

  const add = (message: NewMessage) =>
    setMessages((current) => [...current, { ...message, id: nextId.current++ }]);

  // Asks for a reply to a message already in the conversation.
  async function reply(text: string) {
    setTyping(true);
    try {
      add({ from: "bot", text: await getReply(text) });
    } catch (error) {
      const failure = replyFailure(error);
      if (failure === "quota_exceeded") setUnavailable(true);
      add(
        failure === "rate_limited"
          ? { from: "error", text: RATE_LIMITED }
          : failure === "quota_exceeded"
            ? { from: "error", text: UNAVAILABLE }
            : { from: "error", text: FAILED, retry: text },
      );
    } finally {
      setTyping(false);
    }
    unread.current += 1;
    post({ source: WIDGET_MESSAGE_SOURCE, type: "unread", count: unread.current });
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || typing || unavailable) return;
    setDraft("");
    add({ from: "visitor", text });
    await reply(text);
  }

  // Resends the same message. The visitor's message is already shown, so only the error goes.
  async function retry(errorId: number, text: string) {
    if (typing) return;
    setMessages((current) => current.filter((message) => message.id !== errorId));
    await reply(text);
  }

  const remaining = MAX_CHAT_MESSAGE_LENGTH - draft.length;

  return (
    <div className="flex h-dvh flex-col bg-white text-[#161A24]" style={FONT}>
      <header className="flex items-center justify-between gap-3 px-4 py-3" style={brand}>
        <h1 className="truncate text-sm font-semibold">{config.headerText}</h1>
        {/* The ring takes the header's text colour, so it shows on any brand colour. */}
        <button
          type="button"
          aria-label="Close chat"
          onClick={() => post(CLOSE)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg leading-none hover:bg-black/10 focus-visible:outline-2 focus-visible:-outline-offset-2"
          style={{ outlineColor: brand.color }}
        >
          ×
        </button>
      </header>

      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
      >
        {messages.map((message) =>
          message.from === "error" ? (
            <div
              key={message.id}
              data-from="error"
              className="max-w-[85%] self-start rounded-2xl rounded-bl-md border border-[#FDA29B] bg-[#FEF3F2] px-3 py-2 text-sm text-[#B42318]"
            >
              <p>{message.text}</p>
              {message.retry !== undefined && (
                <button
                  type="button"
                  onClick={() => retry(message.id, message.retry!)}
                  disabled={typing}
                  className={`mt-1 rounded-sm font-medium underline underline-offset-2 disabled:opacity-50 ${FOCUS}`}
                >
                  Try again
                </button>
              )}
            </div>
          ) : (
          <p
            key={message.id}
            data-from={message.from}
            className={
              message.from === "visitor"
                ? "max-w-[85%] self-end whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-3 py-2 text-sm"
                : "max-w-[85%] self-start whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-[#EEF1F6] px-3 py-2 text-sm"
            }
            style={message.from === "visitor" ? brand : undefined}
          >
            {message.text}
          </p>
          ),
        )}
        {typing && (
          <p
            role="status"
            aria-label="Typing"
            className="flex gap-1 self-start rounded-2xl rounded-bl-md bg-[#EEF1F6] px-3 py-3"
          >
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="h-1.5 w-1.5 rounded-full bg-[#70788D] motion-safe:animate-bounce"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </p>
        )}
      </div>

      <form onSubmit={send} className="flex flex-wrap gap-2 border-t border-[#E3E7EE] p-3">
        <label htmlFor="askwell-message" className="sr-only">
          Message
        </label>
        {/* The ring is ink on white, so it doesn't depend on the owner's brand colour. */}
        <input
          id="askwell-message"
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          placeholder={unavailable ? UNAVAILABLE : "Ask a question"}
          disabled={unavailable}
          aria-describedby={draft.length >= COUNTER_FROM ? "askwell-counter" : undefined}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-full border border-[#D7DCE6] px-4 py-2 text-sm focus:border-[#70788D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#161A24] disabled:bg-[#F5F7FA]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || typing || unavailable}
          className={`rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${FOCUS}`}
          style={brand}
        >
          Send
        </button>
        {draft.length >= COUNTER_FROM && (
          <p
            id="askwell-counter"
            aria-live="polite"
            className={`w-full px-4 text-xs ${remaining === 0 ? "text-[#B42318]" : "text-[#70788D]"}`}
          >
            {remaining === 0
              ? `Limit reached: ${MAX_CHAT_MESSAGE_LENGTH.toLocaleString("en-US")} characters`
              : `${remaining} ${remaining === 1 ? "character" : "characters"} left`}
          </p>
        )}
      </form>

      {config.showBadge && (
        <p className="pb-2 text-center text-xs text-[#70788D]">
          Powered by{" "}
          <a href="/" target="_blank" rel="noopener noreferrer" className={`underline ${FOCUS}`}>
            {APP_NAME}
          </a>
        </p>
      )}
    </div>
  );
}
