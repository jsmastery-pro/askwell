import {
  APP_NAME,
  DEFAULT_WIDGET_CONFIG,
  MAX_MESSAGE_LENGTH,
  type WidgetSettings,
} from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createEmbedBridge, type BridgeWindow } from "./bridge";
import { initialChatState, type ChatState } from "./chat-state";
import { closeOnEscape, EmbedPanel } from "./EmbedPanel";
import { EmbedUnavailable } from "./EmbedUnavailable";

const HOST = "http://localhost:8080";
const XSS = "<img src=x onerror=alert(1)>";

function render(
  config: Partial<WidgetSettings> = {},
  { hostOrigin = HOST as string | null, state = initialChatState as ChatState } = {},
) {
  return renderToStaticMarkup(
    <EmbedPanel
      config={{ ...DEFAULT_WIDGET_CONFIG, ...config }}
      publicKey="pk_test_123"
      hostOrigin={hostOrigin}
      initialState={state}
    />,
  );
}

describe("EmbedPanel", () => {
  it("shows the header text and a close button", () => {
    const html = render({ header_text: "Need help?" });
    expect(html).toMatch(/<h1[^>]*>Need help\?<\/h1>/);
    expect(html).toMatch(/<button[^>]*aria-label="Close chat"/);
  });

  it("hides the close button when messaging is off", () => {
    expect(render({}, { hostOrigin: null })).not.toContain('aria-label="Close chat"');
  });

  it("shows the badge only when show_badge is on", () => {
    expect(render({ show_badge: true })).toContain(`Powered by ${APP_NAME}`);
    expect(render({ show_badge: false })).not.toContain("Powered by");
  });

  it("limits the input to MAX_MESSAGE_LENGTH", () => {
    expect(render()).toMatch(new RegExp(`<textarea[^>]*maxLength="${MAX_MESSAGE_LENGTH}"`));
  });

  it("accents the send button with button_color", () => {
    expect(render({ button_color: "#1d4ed8" })).toMatch(
      /<button type="submit"[^>]*style="background-color:#1d4ed8;color:var\(--color-white\)"/,
    );
  });

  it("shows the typing state", () => {
    const state: ChatState = {
      ...initialChatState,
      typing: true,
      messages: [{ id: "1", role: "visitor", text: "Hi" }],
    };
    const html = render({}, { state });
    expect(html).toContain('data-role="typing"');
    expect(html).toContain("Typing…");
  });

  it("renders messages as text, never as HTML", () => {
    const state: ChatState = {
      ...initialChatState,
      messages: [
        { id: "1", role: "visitor", text: XSS },
        { id: "2", role: "bot", text: `<b>bold</b> ${XSS}` },
      ],
    };
    const html = render({}, { state });
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<b>/);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("shows a friendly error", () => {
    const html = render({}, { state: { ...initialChatState, error: "quota_exceeded" } });
    expect(html).toMatch(/<p role="alert"[^>]*>This chat can(&#x27;|')t answer right now/);
  });
});

describe("EmbedUnavailable", () => {
  it("says the chat isn't available", () => {
    const html = renderToStaticMarkup(<EmbedUnavailable hostOrigin={HOST} />);
    expect(html).toContain("This chat isn&#x27;t available");
    expect(html).toContain('aria-label="Close chat"');
  });
});

describe("closeOnEscape", () => {
  /** A bridge on a fake window that records every postMessage. */
  function bridgeFor(hostOrigin: string | null) {
    const posted: { message: unknown; targetOrigin: string }[] = [];
    const win: BridgeWindow = {
      parent: { postMessage: (message, targetOrigin) => posted.push({ message, targetOrigin }) },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    return { bridge: createEmbedBridge(hostOrigin, win), posted };
  }

  it("sends askwell:close to the host origin only", () => {
    const { bridge, posted } = bridgeFor(HOST);
    closeOnEscape({ key: "Escape", isComposing: false }, bridge);
    expect(posted).toEqual([{ message: { type: "askwell:close" }, targetOrigin: HOST }]);
  });

  it("ignores other keys and Escape during IME composition", () => {
    const { bridge, posted } = bridgeFor(HOST);
    closeOnEscape({ key: "Enter", isComposing: false }, bridge);
    closeOnEscape({ key: "Esc", isComposing: false }, bridge);
    closeOnEscape({ key: "Escape", isComposing: true }, bridge);
    expect(posted).toEqual([]);
  });

  it("ignores Safari's composition-ending Escape (isComposing false, keyCode 229)", () => {
    const { bridge, posted } = bridgeFor(HOST);
    closeOnEscape({ key: "Escape", isComposing: false, keyCode: 229 }, bridge);
    expect(posted).toEqual([]);
    closeOnEscape({ key: "Escape", isComposing: false, keyCode: 27 }, bridge);
    expect(posted).toEqual([{ message: { type: "askwell:close" }, targetOrigin: HOST }]);
  });

  it("sends nothing when messaging is off", () => {
    const { bridge, posted } = bridgeFor(null);
    closeOnEscape({ key: "Escape", isComposing: false }, bridge);
    closeOnEscape({ key: "Escape", isComposing: false }, null);
    expect(posted).toEqual([]);
  });
});
