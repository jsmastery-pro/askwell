// Text from an uploaded knowledge file (project.md §6.4 Processing): PDF via
// unpdf, Markdown and TXT as UTF-8. The text is data for the bot, never
// instructions (§9 "Prompt injection (documents)"); this file only reads it.
import "server-only";
import { extractText as extractPdfText } from "unpdf";
import type { AllowedFileExtension } from "@askwell/shared";

export type ExtractErrorCode = "unreadable" | "empty";

/** The file can't be read as its type, or holds no text. Routes mark the source failed. */
export class ExtractError extends Error {
  readonly code: ExtractErrorCode;

  constructor(code: ExtractErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ExtractError";
    this.code = code;
  }
}

/**
 * Line endings to \n, no NUL characters (Postgres text can't store them),
 * trailing spaces off each line, trimmed.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

async function readPdf(bytes: Uint8Array): Promise<string> {
  try {
    // PDF.js may detach the buffer it's given; pass a copy so the caller's stays usable.
    const { text } = await extractPdfText(bytes.slice(), { mergePages: false });
    return text.join("\n\n");
  } catch (error) {
    throw new ExtractError("unreadable", "This PDF can't be read.", { cause: error });
  }
}

function readUtf8(bytes: Uint8Array): string {
  try {
    // fatal: invalid UTF-8 is an error, not U+FFFD noise. The BOM is dropped.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new ExtractError("unreadable", "This file isn't UTF-8 text.", { cause: error });
  }
}

/** The file's text, normalized. Throws ExtractError when it's unreadable or has no text. */
export async function extractText(bytes: Uint8Array, type: AllowedFileExtension): Promise<string> {
  const raw = type === "pdf" ? await readPdf(bytes) : readUtf8(bytes);
  const text = normalizeText(raw);
  if (!text) {
    throw new ExtractError(
      "empty",
      type === "pdf" ? "This PDF has no text (it may be scanned images)." : "This file has no text.",
    );
  }
  return text;
}
