import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_WIDGET_CONFIG, MAX_CHAT_MESSAGE_LENGTH } from "@askwell/shared";
import { WIDGET_MESSAGE_SOURCE } from "@askwell/shared/widget-messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getReply } from "../../app/embed/reply";
import { ReplyError } from "../../app/embed/reply-error";
import { Panel } from "./Panel";

vi.mock("../../app/embed/reply", () => ({
  getReply: vi.fn(async (message: string) => `Echo: ${message}`),
}));

const HOST = "https://customer.example";
const CLOSE = { source: WIDGET_MESSAGE_SOURCE, type: "close" };

let parent: Window;
let postMessage: ReturnType<typeof vi.spyOn>;

// Stand in for the customer's page: a real window as the iframe's parent.
beforeEach(() => {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  parent = frame.contentWindow!;
  postMessage = vi.spyOn(parent, "postMessage").mockImplementation(() => {});
  Object.defineProperty(window, "parent", { value: parent, configurable: true });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "parent", { value: window, configurable: true });
  document.body.innerHTML = "";
  vi.mocked(getReply).mockImplementation(async (message: string) => `Echo: ${message}`);
});

function renderPanel(overrides: Partial<typeof DEFAULT_WIDGET_CONFIG> = {}, parentOrigin: string | null = HOST) {
  return render(<Panel config={{ ...DEFAULT_WIDGET_CONFIG, ...overrides }} parentOrigin={parentOrigin} />);
}

async function sendMessage(text: string) {
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
  await act(async () => {
    fireEvent.submit(screen.getByLabelText("Message").closest("form")!);
  });
}

describe("Panel", () => {
  it("renders HTML in messages as literal text", async () => {
    const attack = "<img src=x onerror=alert(1)>";
    const { container } = renderPanel();

    await sendMessage(attack);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(attack)).toBeTruthy();
    expect(screen.getByText(`Echo: ${attack}`)).toBeTruthy();
  });

  it("shows the typing state, then the reply", async () => {
    let finish: (reply: string) => void = () => {};
    vi.mocked(getReply).mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    renderPanel();

    await sendMessage("Do you ship to Canada?");
    expect(screen.getByRole("status", { name: "Typing" })).toBeTruthy();

    await act(async () => finish("Yes, we do."));
    expect(screen.queryByRole("status", { name: "Typing" })).toBeNull();
    expect(screen.getByText("Yes, we do.")).toBeTruthy();
  });

  it("posts close to the exact parent origin when Escape is pressed", () => {
    renderPanel();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(postMessage).toHaveBeenCalledWith(CLOSE, HOST);
  });

  it("posts close from the close button, never to *", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Close chat" }));

    expect(postMessage).toHaveBeenCalledWith(CLOSE, HOST);
    const targets: unknown[] = postMessage.mock.calls.map((call: unknown[]) => call[1]);
    expect(targets).not.toContain("*");
  });

  it("posts nothing without a valid parent origin", () => {
    renderPanel({}, null);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(postMessage).not.toHaveBeenCalled();
  });

  it("posts unread after a reply and resets it only on open from the parent", async () => {
    const unread = (count: number) => ({ source: WIDGET_MESSAGE_SOURCE, type: "unread", count });
    const open = { source: WIDGET_MESSAGE_SOURCE, type: "open" };
    renderPanel();

    await sendMessage("one");
    expect(postMessage).toHaveBeenLastCalledWith(unread(1), HOST);

    act(() => window.dispatchEvent(new MessageEvent("message", { data: open, origin: "https://evil.test", source: parent })));
    await sendMessage("two");
    expect(postMessage).toHaveBeenLastCalledWith(unread(2), HOST);

    act(() => window.dispatchEvent(new MessageEvent("message", { data: open, origin: HOST, source: parent })));
    await sendMessage("three");
    expect(postMessage).toHaveBeenLastCalledWith(unread(1), HOST);
  });

  it("shows the Powered by badge only when showBadge is true", () => {
    renderPanel({ showBadge: true });
    expect(screen.getByText(/Powered by/)).toBeTruthy();
    cleanup();

    renderPanel({ showBadge: false });
    expect(screen.queryByText(/Powered by/)).toBeNull();
  });

  it("uses the configured header text", () => {
    renderPanel({ headerText: "Talk to Acme" });
    expect(screen.getByRole("heading", { name: "Talk to Acme" })).toBeTruthy();
  });
});

describe("Panel error states", () => {
  const input = () => screen.getByLabelText("Message") as HTMLInputElement;
  const sendButton = () => screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
  const visitorMessages = (container: HTMLElement) => container.querySelectorAll('[data-from="visitor"]');

  it("says the visitor is too fast on rate_limited, and keeps the input on", async () => {
    vi.mocked(getReply).mockRejectedValueOnce(new ReplyError("rate_limited"));
    renderPanel();
    await sendMessage("Hello?");

    expect(screen.getByText("You're sending messages too fast. Try again in a minute.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(input().disabled).toBe(false);
  });

  it("turns the input off with a note on quota_exceeded", async () => {
    vi.mocked(getReply).mockRejectedValueOnce(new ReplyError("quota_exceeded"));
    renderPanel();
    await sendMessage("Hello?");

    expect(screen.getByText("This assistant is unavailable right now.")).toBeTruthy();
    expect(input().disabled).toBe(true);
    expect(input().placeholder).toBe("This assistant is unavailable right now.");
    expect(sendButton().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it.each([
    ["an unknown code", new ReplyError("internal")],
    ["a network error", new TypeError("Failed to fetch https://internal.example/secret")],
  ])("shows a generic error for %s, never the raw text", async (_name, error) => {
    vi.mocked(getReply).mockRejectedValueOnce(error);
    const { container } = renderPanel();
    await sendMessage("Hello?");

    expect(screen.getByText("Something went wrong.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/internal|secret|fetch/i);
    expect(input().disabled).toBe(false);
  });

  it("Try again resends the same message once, without repeating the visitor's message", async () => {
    vi.mocked(getReply).mockRejectedValueOnce(new Error("boom"));
    const { container } = renderPanel();
    await sendMessage("Do you ship to Canada?");
    expect(visitorMessages(container)).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(getReply).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getReply).mock.calls[1]![0]).toBe("Do you ship to Canada?");
    expect(visitorMessages(container)).toHaveLength(1);
    expect(screen.queryByText("Something went wrong.")).toBeNull();
    expect(screen.getByText("Echo: Do you ship to Canada?")).toBeTruthy();
  });
});

describe("Panel input", () => {
  const input = () => screen.getByLabelText("Message") as HTMLInputElement;
  const type = (length: number) => fireEvent.change(input(), { target: { value: "a".repeat(length) } });

  it("stops at the message length limit", () => {
    renderPanel();
    expect(input().maxLength).toBe(MAX_CHAT_MESSAGE_LENGTH);
  });

  it("shows a counter for the last 100 characters, tied to the input", () => {
    renderPanel();
    type(MAX_CHAT_MESSAGE_LENGTH - 101);
    expect(screen.queryByText(/characters? left/)).toBeNull();
    expect(input().hasAttribute("aria-describedby")).toBe(false);

    type(MAX_CHAT_MESSAGE_LENGTH - 100);
    expect(screen.getByText("100 characters left")).toBeTruthy();
    expect(document.getElementById(input().getAttribute("aria-describedby")!)!.textContent).toBe("100 characters left");

    type(MAX_CHAT_MESSAGE_LENGTH - 1);
    expect(screen.getByText("1 character left")).toBeTruthy();

    type(MAX_CHAT_MESSAGE_LENGTH);
    expect(screen.getByText("Limit reached: 1,000 characters")).toBeTruthy();
  });

  it("has a visible focus ring, not just a border colour change", () => {
    renderPanel();
    expect(input().className).toContain("focus-visible:outline-2");
    expect(input().className).toContain("focus-visible:outline-[#161A24]");
    expect(input().className).not.toContain("outline-none");
  });

  it("draws the close button's ring in the header's text colour, so it shows on any brand", () => {
    renderPanel({ buttonColor: "#10131d" });
    const close = screen.getByRole("button", { name: "Close chat" });
    expect(close.style.outlineColor).toBe(close.closest("header")!.style.color);
    expect(close.style.outlineColor).toBe("rgb(255, 255, 255)");
    cleanup();

    renderPanel({ buttonColor: "#fde68a" });
    const light = screen.getByRole("button", { name: "Close chat" });
    expect(light.style.outlineColor).not.toBe("rgb(255, 255, 255)");
    expect(light.style.outlineColor).toBe(light.closest("header")!.style.color);
  });
});
