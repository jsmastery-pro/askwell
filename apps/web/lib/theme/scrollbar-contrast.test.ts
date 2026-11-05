import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Scrollbar thumbs must stand out from their track (WCAG 1.4.11 non-text
// contrast, >= 3:1), at rest and on hover, on every surface in globals.css.
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** The hex value of every `--color-grey-N` token. */
const greys = Object.fromEntries(
  [...css.matchAll(/--color-(grey-\d+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]),
);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Each surface block's scrollbar tokens, resolved to hex. */
const surfaces = [
  ...css.matchAll(
    /--surface-scrollbar-track: var\(--color-(grey-\d+)\);\s*--surface-scrollbar-thumb: var\(--color-(grey-\d+)\);\s*--surface-scrollbar-thumb-hover: var\(--color-(grey-\d+)\);/g,
  ),
].map((m) => ({ track: greys[m[1]!]!, thumb: greys[m[2]!]!, hover: greys[m[3]!]! }));

describe("scrollbar contrast", () => {
  it("finds the light, dark and dark-theme surfaces", () => {
    expect(surfaces).toHaveLength(3);
  });

  it.each(surfaces.map((s, i) => [i, s] as const))("surface %i: thumb and hover are >= 3:1 against the track", (_i, s) => {
    expect(contrast(s.thumb, s.track)).toBeGreaterThanOrEqual(3);
    expect(contrast(s.hover, s.track)).toBeGreaterThanOrEqual(3);
    expect(s.hover).not.toBe(s.thumb);
  });
});
