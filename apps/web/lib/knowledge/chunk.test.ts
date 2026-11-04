import { CHUNK_OVERLAP, CHUNK_SIZE } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk";

/** Every word of `text` appears in at least one chunk. */
function coversAllWords(text: string, chunks: string[]): boolean {
  const joined = ` ${chunks.join(" ")} `;
  return text.split(/\s+/).filter(Boolean).every((word) => joined.includes(word));
}

/** `count` sentences like "Sentence 7 is about topic 7.", each ~30 characters. */
const sentences = (count: number) =>
  Array.from({ length: count }, (_, i) => `Sentence ${i} is about topic ${i}.`).join(" ");

describe("chunkText", () => {
  it("defaults to CHUNK_SIZE / CHUNK_OVERLAP from shared", () => {
    const text = sentences(400);
    expect(chunkText(text)).toEqual(chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP));
    for (const chunk of chunkText(text)) expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE);
  });

  it("empty or whitespace-only text gives no chunks", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("  \n\n\t ")).toEqual([]);
  });

  it("short text is one chunk, trimmed", () => {
    expect(chunkText("  Refunds take 5 days.  \n")).toEqual(["Refunds take 5 days."]);
  });

  it("text of exactly the size is one chunk", () => {
    const text = "x".repeat(100);
    expect(chunkText(text, 100, 10)).toEqual([text]);
  });

  it("text with no breaks is cut at exactly the size, each chunk repeating the previous one's last `overlap` characters", () => {
    const text = Array.from({ length: 250 }, (_, i) => String.fromCharCode(97 + (i % 26))).join("");
    const chunks = chunkText(text, 100, 20);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 90]);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]?.slice(0, 20)).toBe(chunks[i - 1]?.slice(-20));
    }
    // Starts at 0, 80, 160: the full text, nothing lost.
    expect(chunks[0]).toBe(text.slice(0, 100));
    expect(chunks[2]).toBe(text.slice(160));
  });

  it("with zero overlap, chunks tile the text exactly", () => {
    const text = "y".repeat(250);
    expect(chunkText(text, 100, 0).join("")).toBe(text);
  });

  it("prefers a paragraph break over a sentence break", () => {
    const first = `${"A".repeat(60)}. ${"B".repeat(10)}.`; // ~74 chars, a sentence break inside
    const text = `${first}\n\n${"C".repeat(40)}. ${"D".repeat(40)}.`;
    const chunks = chunkText(text, 100, 10);
    expect(chunks[0]).toBe(first);
  });

  it("prefers a sentence break over a word break", () => {
    const text = `${"word ".repeat(12)}end here. ${"more ".repeat(30)}`;
    const chunks = chunkText(text, 100, 10);
    expect(chunks[0]?.endsWith("end here.")).toBe(true);
  });

  it("ignores breaks in the first half of the window (no tiny chunks)", () => {
    const text = `Hi. ${"z".repeat(200)}`;
    const chunks = chunkText(text, 100, 10);
    expect(chunks[0]?.length).toBe(100);
  });

  it("overlapping chunks start on a word, and repeat the end of the previous chunk", () => {
    const text = sentences(60);
    const chunks = chunkText(text, 300, 60);
    expect(chunks.length).toBeGreaterThan(3);
    for (let i = 1; i < chunks.length; i++) {
      const previous = chunks[i - 1] as string;
      const chunk = chunks[i] as string;
      expect(chunk.length).toBeLessThanOrEqual(300);
      // The first word of each chunk is a whole word from the previous chunk's tail.
      const firstWord = chunk.split(" ")[0] as string;
      expect(previous.slice(-60)).toContain(` ${firstWord}`);
    }
    expect(coversAllWords(text, chunks)).toBe(true);
  });

  it("collapses 3+ newlines and never returns empty chunks", () => {
    const text = `Intro.\n\n\n\n\n${"para ".repeat(40)}\n\n\n\n${"tail ".repeat(40)}`;
    const chunks = chunkText(text, 120, 20);
    expect(chunks.every((c) => c.trim().length > 0 && c === c.trim())).toBe(true);
    expect(chunks.join("\n")).not.toMatch(/\n{3,}/);
  });

  it.each([
    ["size 0", 0, 0],
    ["a negative overlap", 100, -1],
    ["overlap of half the size", 100, 50],
    ["a fractional size", 10.5, 1],
  ])("refuses %s", (_label, size, overlap) => {
    expect(() => chunkText("text", size, overlap)).toThrow(RangeError);
  });
});
