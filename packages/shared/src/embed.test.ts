import { describe, expect, it } from "vitest";
import { EMBED_MAX_HEIGHT, isEmbedMessage } from "./index";

describe("isEmbedMessage", () => {
  it("accepts the three message types", () => {
    expect(isEmbedMessage({ type: "askwell:close" })).toBe(true);
    expect(isEmbedMessage({ type: "askwell:resize", height: 480 })).toBe(true);
    expect(isEmbedMessage({ type: "askwell:resize", height: 480.5 })).toBe(true);
    expect(isEmbedMessage({ type: "askwell:unread", count: 0 })).toBe(true);
    expect(isEmbedMessage({ type: "askwell:unread", count: 3 })).toBe(true);
  });

  it("rejects non-objects", () => {
    for (const data of [undefined, null, "askwell:close", 1, true, [], ["askwell:close"]]) {
      expect(isEmbedMessage(data)).toBe(false);
    }
  });

  it("rejects unknown types", () => {
    expect(isEmbedMessage({})).toBe(false);
    expect(isEmbedMessage({ type: "askwell:open" })).toBe(false);
    expect(isEmbedMessage({ type: "close" })).toBe(false);
    expect(isEmbedMessage({ type: "ASKWELL:CLOSE" })).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(isEmbedMessage({ type: "askwell:close", html: "<img src=x>" })).toBe(false);
    expect(isEmbedMessage({ type: "askwell:resize", height: 100, width: 100 })).toBe(false);
  });

  it("rejects missing or invalid values", () => {
    expect(isEmbedMessage({ type: "askwell:resize" })).toBe(false);
    expect(isEmbedMessage({ type: "askwell:resize", height: "480" })).toBe(false);
    expect(isEmbedMessage({ type: "askwell:resize", height: -1 })).toBe(false);
    expect(isEmbedMessage({ type: "askwell:resize", height: Number.NaN })).toBe(false);
    expect(isEmbedMessage({ type: "askwell:resize", height: Infinity })).toBe(false);
    expect(isEmbedMessage({ type: "askwell:resize", height: EMBED_MAX_HEIGHT + 1 })).toBe(false);
    expect(isEmbedMessage({ type: "askwell:unread" })).toBe(false);
    expect(isEmbedMessage({ type: "askwell:unread", count: 1.5 })).toBe(false);
    expect(isEmbedMessage({ type: "askwell:unread", count: -1 })).toBe(false);
  });
});
