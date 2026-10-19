// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_CHAT_BODY_BYTES, readCappedJson } from "./body";

// A body with no Content-Length header, streamed in chunks.
function streamed(size: number, chunkSize = 4096) {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= size) return controller.close();
      const n = Math.min(chunkSize, size - sent);
      controller.enqueue(new Uint8Array(n).fill(0x61));
      sent += n;
    },
  });
  return { request: new Request("https://app.test/x", { method: "POST", body, duplex: "half" } as RequestInit), sent: () => sent };
}

describe("readCappedJson", () => {
  it("parses a normal JSON body", async () => {
    const request = new Request("https://app.test/x", { method: "POST", body: JSON.stringify({ message: "hi" }) });
    expect(await readCappedJson(request)).toEqual({ ok: true, json: { message: "hi" } });
  });

  it("accepts a body exactly at the cap", async () => {
    const json = JSON.stringify({ pad: "x".repeat(MAX_CHAT_BODY_BYTES - 10) });
    expect(Buffer.byteLength(json)).toBe(MAX_CHAT_BODY_BYTES);
    expect((await readCappedJson(new Request("https://app.test/x", { method: "POST", body: json }))).ok).toBe(true);
  });

  it("rejects an oversized Content-Length without reading the body", async () => {
    const { request, sent } = streamed(5 * 1024 * 1024);
    request.headers.set("content-length", String(5 * 1024 * 1024));
    expect(await readCappedJson(request)).toEqual({ ok: false, reason: "too_large" });
    // A ReadableStream pulls its first chunk on creation; nothing past that is ever read.
    expect(sent()).toBeLessThanOrEqual(4096);
  });

  it("stops reading once the actual bytes pass the cap, with no Content-Length", async () => {
    const { request, sent } = streamed(5 * 1024 * 1024);
    expect(await readCappedJson(request)).toEqual({ ok: false, reason: "too_large" });
    expect(sent()).toBeLessThan(MAX_CHAT_BODY_BYTES + 3 * 4096);
  });

  it("catches a Content-Length that understates the body", async () => {
    const { request } = streamed(MAX_CHAT_BODY_BYTES * 4);
    request.headers.set("content-length", "10");
    expect(await readCappedJson(request)).toEqual({ ok: false, reason: "too_large" });
  });

  it("reports invalid JSON", async () => {
    expect(await readCappedJson(new Request("https://app.test/x", { method: "POST", body: "{nope" }))).toEqual({
      ok: false,
      reason: "invalid_json",
    });
  });
});
