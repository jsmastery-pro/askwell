import type { EmbedMessage } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { createEmbedBridge, parseHostOrigin, type BridgeWindow } from "./bridge";

const HOST = "http://localhost:8080";

/** A fake window: records postMessage calls and lets tests deliver events. */
function fakeWindow() {
  const posted: { message: unknown; targetOrigin: string }[] = [];
  const listeners = new Set<(event: MessageEvent) => void>();
  const win: BridgeWindow = {
    parent: { postMessage: (message, targetOrigin) => posted.push({ message, targetOrigin }) },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const deliver = (origin: string, data: unknown) => {
    for (const l of listeners) l({ origin, data } as MessageEvent);
  };
  return { win, posted, listeners, deliver };
}

describe("parseHostOrigin", () => {
  it("accepts exact http(s) origins", () => {
    expect(parseHostOrigin("http://localhost:8080")).toBe("http://localhost:8080");
    expect(parseHostOrigin("https://host.example")).toBe("https://host.example");
    expect(parseHostOrigin("https://sub.host.example:8443")).toBe("https://sub.host.example:8443");
  });

  it("rejects everything else", () => {
    for (const raw of [
      undefined,
      null,
      "",
      "*",
      "null",
      "host.example",
      "//host.example",
      "https://host.example/",
      "https://host.example/path",
      "https://host.example?x=1",
      "https://host.example#x",
      "https://user:pass@host.example",
      "HTTPS://HOST.EXAMPLE",
      "https://host.example:443",
      "javascript:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "ftp://host.example",
      ["https://host.example"],
    ]) {
      expect(parseHostOrigin(raw), String(raw)).toBeNull();
    }
  });
});

describe("createEmbedBridge", () => {
  it("posts only to the exact host origin, never '*'", () => {
    const { win, posted } = fakeWindow();
    const bridge = createEmbedBridge(HOST, win);
    expect(bridge.enabled).toBe(true);

    bridge.send({ type: "askwell:close" });
    bridge.send({ type: "askwell:resize", height: 120 });
    bridge.send({ type: "askwell:unread", count: 2 });

    expect(posted.map((p) => p.targetOrigin)).toEqual([HOST, HOST, HOST]);
    expect(posted.map((p) => p.message)).toEqual([
      { type: "askwell:close" },
      { type: "askwell:resize", height: 120 },
      { type: "askwell:unread", count: 2 },
    ]);
  });

  it("is disabled without a valid origin: sends and listens to nothing", () => {
    for (const origin of [null, "*", "https://host.example/path", "javascript:alert(1)"]) {
      const { win, posted, listeners } = fakeWindow();
      const bridge = createEmbedBridge(origin, win);
      expect(bridge.enabled).toBe(false);
      bridge.send({ type: "askwell:close" });
      bridge.listen(() => undefined);
      expect(posted).toHaveLength(0);
      expect(listeners.size).toBe(0);
    }
  });

  it("accepts a valid message from the host origin", () => {
    const { win, deliver } = fakeWindow();
    const handler = vi.fn<(m: EmbedMessage) => void>();
    createEmbedBridge(HOST, win).listen(handler);

    deliver(HOST, { type: "askwell:unread", count: 0 });

    expect(handler).toHaveBeenCalledExactlyOnceWith({ type: "askwell:unread", count: 0 });
  });

  it("ignores messages from any other origin", () => {
    const { win, deliver } = fakeWindow();
    const handler = vi.fn();
    createEmbedBridge(HOST, win).listen(handler);

    for (const origin of [
      "https://evil.example",
      "http://localhost:8081",
      "https://localhost:8080",
      "http://localhost",
      "null",
      "",
    ]) {
      deliver(origin, { type: "askwell:close" });
    }

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores wrong shapes from the host origin", () => {
    const { win, deliver } = fakeWindow();
    const handler = vi.fn();
    createEmbedBridge(HOST, win).listen(handler);

    for (const data of [
      "askwell:close",
      null,
      {},
      { type: "askwell:open" },
      { type: "askwell:close", extra: 1 },
      { type: "askwell:resize", height: "100" },
      { type: "askwell:unread", count: -1 },
    ]) {
      deliver(HOST, data);
    }

    expect(handler).not.toHaveBeenCalled();
  });

  it("stops listening after unsubscribe", () => {
    const { win, deliver, listeners } = fakeWindow();
    const handler = vi.fn();
    const stop = createEmbedBridge(HOST, win).listen(handler);
    stop();
    deliver(HOST, { type: "askwell:close" });
    expect(handler).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
