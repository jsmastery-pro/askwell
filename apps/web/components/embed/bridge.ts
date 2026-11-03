// postMessage between the panel (this iframe) and the loader on the host page
// (project.md §6.5, §9 "postMessage"). The host origin comes from the `origin`
// query param. It's only used as the postMessage target and the event.origin
// check: the messages carry no data (close, resize, unread), so a site that
// lies about its origin learns nothing.
import { isEmbedMessage, type EmbedMessage } from "@askwell/shared";

/**
 * The exact origin (`scheme://host[:port]`) of a real http(s) site, or null.
 * Anything else (a path, a trailing slash, credentials, "null", other
 * schemes) disables messaging.
 */
export function parseHostOrigin(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // Rejects paths, queries, fragments, credentials and odd spellings.
  if (url.origin !== raw) return null;
  return url.origin;
}

/** The parts of `window` the bridge uses (so tests can pass a fake). */
export interface BridgeWindow {
  parent: { postMessage(message: unknown, targetOrigin: string): void };
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

export interface EmbedBridge {
  /** Whether messaging is on (a valid host origin was given). */
  readonly enabled: boolean;
  /** Sends to the host origin only. Does nothing when disabled. */
  send(message: EmbedMessage): void;
  /**
   * Calls `handler` for messages from the host origin that pass
   * isEmbedMessage. Everything else is dropped. Returns an unsubscribe.
   */
  listen(handler: (message: EmbedMessage) => void): () => void;
}

export function createEmbedBridge(hostOrigin: string | null, win: BridgeWindow): EmbedBridge {
  const origin = parseHostOrigin(hostOrigin);
  if (!origin) {
    return { enabled: false, send: () => undefined, listen: () => () => undefined };
  }

  return {
    enabled: true,
    send(message) {
      win.parent.postMessage(message, origin);
    },
    listen(handler) {
      const listener = (event: MessageEvent) => {
        if (event.origin !== origin) return;
        if (!isEmbedMessage(event.data)) return;
        handler(event.data);
      };
      win.addEventListener("message", listener);
      return () => win.removeEventListener("message", listener);
    },
  };
}
