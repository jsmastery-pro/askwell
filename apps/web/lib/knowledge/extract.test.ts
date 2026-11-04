import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// "server-only" throws outside a React Server Components build; stub it.
vi.mock("server-only", () => ({}));

const { extractText, ExtractError, normalizeText } = await import("./extract");

/** A 2-page PDF with one line of Helvetica text per page (fixtures/two-pages.pdf). */
const PDF = new Uint8Array(readFileSync(new URL("./fixtures/two-pages.pdf", import.meta.url)));
const utf8 = (text: string) => new TextEncoder().encode(text);

async function extractError(promise: Promise<unknown>): Promise<InstanceType<typeof ExtractError>> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ExtractError) return error;
    throw error;
  }
  throw new Error("Expected an ExtractError");
}

describe("extractText", () => {
  it("reads every page of a PDF, pages separated by a blank line", async () => {
    expect(await extractText(PDF, "pdf")).toBe("Askwell answers questions.\n\nRefunds take 5 business days.");
  });

  it("leaves the caller's PDF bytes usable", async () => {
    const bytes = PDF.slice();
    await extractText(bytes, "pdf");
    expect(bytes.byteLength).toBe(PDF.byteLength);
    expect(await extractText(bytes, "pdf")).toContain("Refunds");
  });

  it("reads Markdown as UTF-8, as is", async () => {
    expect(await extractText(utf8("# Shipping\n\nWe ship to **all** of Europe — fast. ✓\n"), "md")).toBe(
      "# Shipping\n\nWe ship to **all** of Europe — fast. ✓",
    );
  });

  it("reads TXT as UTF-8, dropping a BOM and normalizing line endings", async () => {
    expect(await extractText(utf8("﻿Line one\r\nLine two  \r\n"), "txt")).toBe("Line one\nLine two");
  });

  it.each([
    ["an empty TXT", utf8(""), "txt"],
    ["a whitespace-only MD", utf8(" \n\t\n "), "md"],
  ] as const)("%s is empty", async (_label, bytes, type) => {
    expect((await extractError(extractText(bytes, type))).code).toBe("empty");
  });

  it("invalid UTF-8 is unreadable", async () => {
    const error = await extractError(extractText(new Uint8Array([0x48, 0x69, 0xff, 0xfe]), "txt"));
    expect(error.code).toBe("unreadable");
  });

  it("bytes that aren't a PDF are unreadable", async () => {
    const error = await extractError(extractText(utf8("not a pdf at all"), "pdf"));
    expect(error.code).toBe("unreadable");
    expect(error.cause).toBeDefined();
  });
});

describe("normalizeText", () => {
  it("drops NUL characters (Postgres text can't store them)", () => {
    expect(normalizeText("a\u0000b")).toBe("ab");
  });

  it("turns CR and CRLF into LF and trims trailing spaces per line", () => {
    expect(normalizeText("  a \r\nb\t\rc  ")).toBe("a\nb\nc");
  });
});
