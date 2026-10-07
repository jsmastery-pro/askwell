import { describe, expect, it } from "vitest";
import { WIDGET_MESSAGE_SOURCE as source, isLoaderToPanelMessage, isPanelToLoaderMessage } from "./widget-messages";

describe("isPanelToLoaderMessage", () => {
  it("accepts each known message", () => {
    expect(isPanelToLoaderMessage({ source, type: "close" })).toBe(true);
    expect(isPanelToLoaderMessage({ source, type: "resize", height: 480 })).toBe(true);
    expect(isPanelToLoaderMessage({ source, type: "unread", count: 2 })).toBe(true);
  });

  it("rejects junk", () => {
    for (const junk of [null, undefined, "close", 42, [], {}, { type: "close" }, { source, type: "hack" }, { source }]) {
      expect(isPanelToLoaderMessage(junk)).toBe(false);
    }
  });

  it("rejects known types with bad fields", () => {
    expect(isPanelToLoaderMessage({ source, type: "resize", height: "480" })).toBe(false);
    expect(isPanelToLoaderMessage({ source, type: "resize", height: -1 })).toBe(false);
    expect(isPanelToLoaderMessage({ source, type: "unread", count: 1.5 })).toBe(false);
  });
});

describe("isLoaderToPanelMessage", () => {
  it("accepts open and rejects anything else", () => {
    expect(isLoaderToPanelMessage({ source, type: "open" })).toBe(true);
    expect(isLoaderToPanelMessage({ source, type: "close" })).toBe(false);
    expect(isLoaderToPanelMessage({ type: "open" })).toBe(false);
  });
});
