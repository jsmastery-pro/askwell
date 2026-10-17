import { CHUNKING } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk";

describe("chunkText", () => {
  it("returns nothing for empty or whitespace-only text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("returns one chunk for short text", () => {
    expect(chunkText("A short document.")).toEqual(["A short document."]);
  });

  it("splits long text into overlapping chunks sized by CHUNKING", () => {
    const maxChars = CHUNKING.maxTokens * 4;
    const overlapChars = CHUNKING.overlapTokens * 4;
    // A non-repeating sequence so a shared substring can only come from real overlap.
    const text = Array.from({ length: maxChars * 2 + 100 }, (_, i) => (i % 36).toString(36)).join("");

    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(maxChars);
    expect(chunks[0]).toBe(text.slice(0, maxChars));
    expect(chunks[1]).toBe(text.slice(maxChars - overlapChars, maxChars * 2 - overlapChars));
  });
});
