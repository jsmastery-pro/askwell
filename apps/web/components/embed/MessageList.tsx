"use client";

import { useEffect, useRef } from "react";
import { cx } from "../ui/cx";
import type { Accent } from "./accent";
import type { ChatMessage } from "./chat-state";

export interface MessageListProps {
  messages: ChatMessage[];
  typing: boolean;
  accent: Accent;
}

const bubble = "max-w-[85%] rounded-panel px-3.5 py-2 text-sm whitespace-pre-wrap break-words";

/**
 * The conversation. Every message is rendered as text (React escapes it),
 * never as HTML (project.md §9 "XSS").
 */
export function MessageList({ messages, typing, accent }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, typing]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Conversation"
      className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
    >
      {messages.length === 0 && !typing ? (
        <p className="m-auto max-w-60 text-center text-sm text-fg-muted">
          Ask a question and we&apos;ll get back to you right here.
        </p>
      ) : null}

      {messages.map((m) =>
        m.role === "visitor" ? (
          <p
            key={m.id}
            data-role="visitor"
            className={cx(bubble, "self-end rounded-br-control")}
            style={{ backgroundColor: accent.background, color: accent.foreground }}
          >
            {m.text}
          </p>
        ) : (
          <p
            key={m.id}
            data-role="bot"
            className={cx(bubble, "self-start rounded-bl-control border border-line bg-glass-strong text-fg")}
          >
            {m.text}
          </p>
        ),
      )}

      {typing ? (
        <div
          data-role="typing"
          className={cx(bubble, "flex self-start items-center gap-1 border border-line bg-glass-strong")}
        >
          <span className="sr-only">Typing…</span>
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              aria-hidden="true"
              style={{ animationDelay: `${delay}ms` }}
              className="size-1.5 rounded-full bg-fg-subtle motion-safe:animate-bounce"
            />
          ))}
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  );
}
