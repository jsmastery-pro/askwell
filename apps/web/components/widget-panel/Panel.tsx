"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { APP_NAME, MAX_CHAT_MESSAGE_LENGTH, type WidgetConfig } from "@askwell/shared";
import {
  WIDGET_MESSAGE_SOURCE,
  isLoaderToPanelMessage,
  type PanelToLoaderMessage,
} from "@askwell/shared/widget-messages";
import { getReply } from "../../app/embed/reply";
import { getVisitorId } from "./visitor-id";

type ChatMessage = { id: number; from: "visitor" | "bot"; text: string };

const CLOSE: PanelToLoaderMessage = { source: WIDGET_MESSAGE_SOURCE, type: "close" };
const GREETING: ChatMessage = { id: 0, from: "bot", text: "Hi! Ask me anything." };
const FONT = { fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' };
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#161A24]";

function textColorOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const luminance = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luminance > 160 ? "#111" : "#fff";
}

export function Panel({ config, parentOrigin }: { config: WidgetConfig; parentOrigin: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
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

  const add = (from: ChatMessage["from"], text: string) =>
    setMessages((current) => [...current, { id: nextId.current++, from, text }]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || typing) return;
    setDraft("");
    add("visitor", text);
    setTyping(true);
    try {
      add("bot", await getReply(text));
    } catch {
      add("bot", "Something went wrong. Please try again.");
    } finally {
      setTyping(false);
    }
    unread.current += 1;
    post({ source: WIDGET_MESSAGE_SOURCE, type: "unread", count: unread.current });
  }

  return (
    <div className="flex h-dvh flex-col bg-white text-[#161A24]" style={FONT}>
      <header className="flex items-center justify-between gap-3 px-4 py-3" style={brand}>
        <h1 className="truncate text-sm font-semibold">{config.headerText}</h1>
        <button
          type="button"
          aria-label="Close chat"
          onClick={() => post(CLOSE)}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg leading-none hover:bg-black/10 ${FOCUS}`}
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
        {messages.map((message) => (
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
        ))}
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

      <form onSubmit={send} className="flex gap-2 border-t border-[#E3E7EE] p-3">
        <label htmlFor="askwell-message" className="sr-only">
          Message
        </label>
        <input
          id="askwell-message"
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          placeholder="Ask a question"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-full border border-[#D7DCE6] px-4 py-2 text-sm outline-none focus:border-[#70788D]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || typing}
          className={`rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${FOCUS}`}
          style={brand}
        >
          Send
        </button>
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
