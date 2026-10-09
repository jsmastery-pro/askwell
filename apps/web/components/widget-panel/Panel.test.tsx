import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { WIDGET_MESSAGE_SOURCE } from "@askwell/shared/widget-messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getReply } from "../../app/embed/reply";
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
