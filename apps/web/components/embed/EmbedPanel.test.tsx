import {
  APP_NAME,
  DEFAULT_WIDGET_CONFIG,
  MAX_MESSAGE_LENGTH,
  type WidgetSettings,
} from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { initialChatState, type ChatState } from "./chat-state";
import { EmbedPanel } from "./EmbedPanel";
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
