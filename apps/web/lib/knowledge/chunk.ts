import { CHUNKING } from "@askwell/shared";

// No tokenizer dependency: ~4 characters per token is a safe, simple approximation for chunk sizing.
const CHARS_PER_TOKEN = 4;

/** Splits text into overlapping chunks sized by `CHUNKING` (packages/shared). */
export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const maxChars = CHUNKING.maxTokens * CHARS_PER_TOKEN;
  const overlapChars = CHUNKING.overlapTokens * CHARS_PER_TOKEN;
  const chunks: string[] = [];

  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + maxChars, normalized.length);
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = end - overlapChars;
  }

  return chunks;
}
