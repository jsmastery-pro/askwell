// @vitest-environment jsdom
import { DEFAULT_WIDGET_CONFIG, type WidgetConfigResponse } from "@askwell/shared";
import { WIDGET_MESSAGE_SOURCE } from "@askwell/shared/widget-messages";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountWidget, type Unmount } from "./loader";

const APP = "https://app.askwell.test";
const fixture: WidgetConfigResponse = { config: DEFAULT_WIDGET_CONFIG };

let unmount: Unmount | null = null;

function scriptTag(key = "pk_test") {
  const script = document.createElement("script");
  script.src = `${APP}/widget.js`;
  script.dataset.key = key;
  return script;
}

function mockFetch(status: number, body: unknown = fixture) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function mount() {
  mockFetch(200);
  unmount = await mountWidget(scriptTag());
  const root = document.querySelector("[data-askwell]")!.shadowRoot!;
  const button = root.querySelector("button")!;
  const openPanel = () => {
    button.click();
    const frame = root.querySelector("iframe")!;
    // jsdom gives iframes inside a shadow root no window; borrow a real one so
    // message sources are genuine, non-null windows as in a browser.
    const standIn = document.createElement("iframe");
    document.body.append(standIn);
    Object.defineProperty(frame, "contentWindow", { value: standIn.contentWindow });
    return frame;
  };
  return { root, button, openPanel };
}

function send(data: unknown, origin: string, source: Window | null) {
  window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
}

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("mountWidget", () => {
  it("leaves the host page untouched for a bad key", async () => {
    document.body.innerHTML = "<p>host page</p>";
    mockFetch(404, { error: { code: "not_found", message: "Widget not found." } });

    expect(await mountWidget(scriptTag("pk_bad"))).toBeNull();
    expect(document.body.innerHTML).toBe("<p>host page</p>");
  });

  it("renders nothing when the config request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("network"))));

    expect(await mountWidget(scriptTag())).toBeNull();
    expect(document.querySelector("[data-askwell]")).toBeNull();
  });

  it.each([
    ["a missing config", {}],
    ["a missing position", { config: { ...DEFAULT_WIDGET_CONFIG, position: undefined } }],
    ["an unknown position", { config: { ...DEFAULT_WIDGET_CONFIG, position: "middle" } }],
    ["an unknown animation", { config: { ...DEFAULT_WIDGET_CONFIG, animation: "spin" } }],
    ["a non-hex color", { config: { ...DEFAULT_WIDGET_CONFIG, buttonColor: "red;position:static" } }],
    ["a non-string label", { config: { ...DEFAULT_WIDGET_CONFIG, label: 42 } }],
    ["a null body", null],
  ])("renders nothing and doesn't throw for %s", async (_case, body) => {
    document.body.innerHTML = "<p>host page</p>";
    mockFetch(200, body);

    expect(await mountWidget(scriptTag())).toBeNull();
    expect(document.body.innerHTML).toBe("<p>host page</p>");
  });

  it("renders nothing for a non-JSON 200 response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>oops</html>", { status: 200 })));

    expect(await mountWidget(scriptTag())).toBeNull();
    expect(document.querySelector("[data-askwell]")).toBeNull();
  });

  it("fetches the config from the script's own origin", async () => {
    const fetchMock = mockFetch(200);
    unmount = await mountWidget(scriptTag("pk_abc"));

    expect(fetchMock).toHaveBeenCalledWith(`${APP}/api/widget/config?key=pk_abc`, {
      credentials: "omit",
    });
  });

  it("renders the button inside a shadow root with the config label and color", async () => {
    const { button } = await mount();

    expect(document.body.querySelector("button")).toBeNull();
    expect(button.textContent).toContain(DEFAULT_WIDGET_CONFIG.label);
    expect(button.style.background).not.toBe("");
  });

  it("opens the embed iframe with the key and host origin, and toggles it", async () => {
    const { button, openPanel } = await mount();
    const frame = openPanel();

    const src = new URL(frame.src);
    expect(src.origin + src.pathname).toBe(`${APP}/embed`);
    expect(src.searchParams.get("key")).toBe("pk_test");
    expect(src.searchParams.get("origin")).toBe(window.location.origin);
    expect(frame.classList.contains("o")).toBe(true);

    button.click();
    expect(frame.classList.contains("o")).toBe(false);
  });

  it("ignores messages from any origin other than the app", async () => {
    const { openPanel } = await mount();
    const frame = openPanel();

    send({ source: WIDGET_MESSAGE_SOURCE, type: "close" }, "https://evil.test", frame.contentWindow);
    expect(frame.classList.contains("o")).toBe(true);

    send({ source: WIDGET_MESSAGE_SOURCE, type: "close" }, APP, frame.contentWindow);
    expect(frame.classList.contains("o")).toBe(false);
  });

  it("ignores app-origin messages that don't come from its own iframe", async () => {
    const { openPanel } = await mount();
    const frame = openPanel();

    send({ source: WIDGET_MESSAGE_SOURCE, type: "close" }, APP, window);
    expect(frame.classList.contains("o")).toBe(true);
  });

  it("ignores messages that fail the shared type guard", async () => {
    const { openPanel } = await mount();
    const frame = openPanel();

    send({ source: WIDGET_MESSAGE_SOURCE, type: "resize", height: "999px" }, APP, frame.contentWindow);
    expect(frame.style.height).toBe("");
  });

  it("handles resize and unread from the panel", async () => {
    const { button, root, openPanel } = await mount();
    const frame = openPanel();

    send({ source: WIDGET_MESSAGE_SOURCE, type: "resize", height: 420 }, APP, frame.contentWindow);
    expect(frame.style.height).toBe("420px");

    button.click();
    send({ source: WIDGET_MESSAGE_SOURCE, type: "unread", count: 2 }, APP, frame.contentWindow);
    const badge = root.querySelector<HTMLElement>(".n")!;
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe("2");
  });

  it("posts to the panel with the app origin, never *", async () => {
    const { openPanel } = await mount();
    const frame = openPanel();
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");

    frame.dispatchEvent(new Event("load"));

    expect(postMessage).toHaveBeenCalledWith({ source: WIDGET_MESSAGE_SOURCE, type: "open" }, APP);
    const targets: unknown[] = postMessage.mock.calls.map((call) => call[1]);
    expect(targets).not.toContain("*");
  });
});
