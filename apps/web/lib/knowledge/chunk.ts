// Splits a source's text into overlapping chunks for embedding (project.md
// §6.4 Processing). Pure: no I/O, so routes and tests can call it directly.
import { CHUNK_OVERLAP, CHUNK_SIZE } from "@askwell/shared";

/**
 * Where a chunk may end, best first. Each pattern matches the separator
 * itself; the chunk ends right after it.
 */
const BREAKS: RegExp[] = [
  /\n\n/g, // paragraph
  /[.!?]["')\]]*\s/g, // sentence
  /\n/g, // line
  /\s/g, // word
];

/** The end of the last match of `pattern` in `text` at or after `from`, or -1. */
function lastBreakEnd(text: string, pattern: RegExp, from: number): number {
  let end = -1;
  pattern.lastIndex = from;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    end = match.index + match[0].length;
  }
  return end;
}

/**
 * Chunks of at most `size` characters. A chunk ends at the best break in the
 * second half of its window (paragraph, then sentence, then line, then word),
 * or at exactly `size` when the window has none. The next chunk starts
 * `overlap` characters before that end, moved forward to a word start when
 * there is one, so a sentence cut at a boundary still appears whole in one of
 * the two chunks. Empty chunks are dropped; empty text gives [].
 */
export function chunkText(text: string, size: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("size must be a positive integer");
  if (!Number.isInteger(overlap) || overlap < 0 || overlap * 2 >= size) {
    throw new RangeError("overlap must be an integer from 0 to under half of size");
  }

  const source = text.replace(/\n{3,}/g, "\n\n").trim();
  if (source.length <= size) return source ? [source] : [];

  const chunks: string[] = [];
  const minEnd = Math.ceil(size / 2);
  let start = 0;

  while (start < source.length) {
    let end = Math.min(start + size, source.length);
    if (end < source.length) {
      const window = source.slice(start, end);
      for (const pattern of BREAKS) {
        const breakEnd = lastBreakEnd(window, pattern, minEnd);
        if (breakEnd > 0) {
          end = start + breakEnd;
          break;
        }
      }
    }

    const chunk = source.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= source.length) break;

    // Back up by `overlap`, then forward to the next word start within the overlap.
    const back = end - overlap;
    const space = overlap > 0 ? source.slice(back, end).search(/\s/) : -1;
    start = space >= 0 ? back + space + 1 : back;
  }

  return chunks;
}
