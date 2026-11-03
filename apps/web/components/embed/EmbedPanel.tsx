"use client";

import { APP_NAME, MAX_MESSAGE_LENGTH, type WidgetSettings } from "@askwell/shared";
import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { accentFor } from "./accent";
import { createEmbedBridge, parseHostOrigin, type EmbedBridge } from "./bridge";
import {
  chatReducer,
  friendlyError,
  initialChatState,
  sendChatMessage,
  sendableText,
  type ChatState,
} from "./chat-state";
import { CloseIcon, SendIcon } from "./icons";
import { MessageList } from "./MessageList";
import { sendMessage } from "./send-message";
import { getVisitorId } from "./visitor-id";

export interface EmbedPanelProps {
  config: WidgetSettings;
  /** The project's public key (already checked by the config lookup). */
  publicKey: string;
  /** The host page's origin from the `origin` param; null turns messaging off. */
  hostOrigin: string | null;
  /** Starting state (tests). */
  initialState?: ChatState;
}

/**
 * Escape inside the panel asks the loader to close it. Key events don't cross
 * the iframe boundary, so the loader can't see them. Sent through the bridge:
 * only to the validated host origin, and nothing when messaging is off.
 * Ignored while an IME is composing (Escape cancels the composition).
 */
export function closeOnEscape(
  event: { key: string; isComposing: boolean },
  bridge: Pick<EmbedBridge, "send"> | null,
): void {
  if (event.key !== "Escape" || event.isComposing) return;
  bridge?.send({ type: "askwell:close" });
}

/** The chat panel inside the widget iframe (project.md §6.5 "Panel"). */
export function EmbedPanel({
  config,
  publicKey,
  hostOrigin,
  initialState = initialChatState,
}: EmbedPanelProps) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const [draft, setDraft] = useState("");
  const bridgeRef = useRef<EmbedBridge | null>(null);
  const unreadRef = useRef(0);
  const inputId = useId();
  const accent = accentFor(config.button_color);
  const messagingEnabled = parseHostOrigin(hostOrigin) !== null;

  // postMessage with the host page: only its exact origin, both ways.
  useEffect(() => {
    const bridge = createEmbedBridge(hostOrigin, window);
    bridgeRef.current = bridge;
    // The loader sends nothing the panel acts on yet. Valid messages from the
    // host origin arrive here; everything else is dropped by the bridge.
    const stop = bridge.listen(() => undefined);
    const onKeyDown = (event: { key: string; isComposing: boolean }) => closeOnEscape(event, bridge);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      stop();
      window.removeEventListener("keydown", onKeyDown);
      bridgeRef.current = null;
    };
  }, [hostOrigin]);

  // Unread: replies that arrive while the visitor is elsewhere.
  const replies = state.messages.filter((m) => m.role === "bot").length;
  const repliesSeen = useRef(replies);
  useEffect(() => {
    if (replies <= repliesSeen.current) return;
    const added = replies - repliesSeen.current;
    repliesSeen.current = replies;
    if (document.hasFocus()) return;
    unreadRef.current += added;
    bridgeRef.current?.send({ type: "askwell:unread", count: unreadRef.current });
  }, [replies]);

  useEffect(() => {
    const clear = () => {
      if (unreadRef.current === 0) return;
      unreadRef.current = 0;
      bridgeRef.current?.send({ type: "askwell:unread", count: 0 });
    };
    window.addEventListener("focus", clear);
    return () => window.removeEventListener("focus", clear);
  }, []);

  const canSend = !state.typing && sendableText(draft) !== null;

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    const text = draft;
    setDraft("");
    await sendChatMessage(text, {
      key: publicKey,
      visitorId: getVisitorId(),
      conversationId: state.conversationId,
      send: sendMessage,
      dispatch,
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div data-surface="light" className="flex h-dvh min-w-[320px] flex-col">
      <header className="flex items-center gap-2 border-b border-line bg-glass-strong px-4 py-3 backdrop-blur-glass">
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{config.header_text}</h1>
        {messagingEnabled ? (
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => bridgeRef.current?.send({ type: "askwell:close" })}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-fg-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-focus"
          >
            <CloseIcon className="size-4" />
          </button>
        ) : null}
      </header>

      <MessageList messages={state.messages} typing={state.typing} accent={accent} />

      <footer className="flex flex-col gap-2 border-t border-line bg-glass-strong px-3 pt-3 pb-2 backdrop-blur-glass">
        {state.error ? (
          <p role="alert" className="rounded-control border border-line-strong bg-glass px-3 py-2 text-xs text-fg">
            {friendlyError(state.error)}
          </p>
        ) : null}
        <form onSubmit={submit} className="flex items-end gap-2">
          <label htmlFor={inputId} className="sr-only">
            Message
          </label>
          <textarea
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={1}
            placeholder="Type your message…"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-control border border-line-strong bg-glass px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:ring-2 focus-visible:ring-focus [field-sizing:content]"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!canSend}
            style={{ backgroundColor: accent.background, color: accent.foreground }}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-control outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-40"
          >
            <SendIcon className="size-4" />
          </button>
        </form>
        {config.show_badge ? (
          <p className="text-center text-[11px] text-fg-subtle">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-control outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-focus"
            >
              Powered by {APP_NAME}
            </a>
          </p>
        ) : null}
      </footer>
    </div>
  );
}
