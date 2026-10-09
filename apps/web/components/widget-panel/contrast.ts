// WCAG 2.x relative luminance of one 0–255 sRGB channel.
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * linear(n >> 16) + 0.7152 * linear((n >> 8) & 255) + 0.0722 * linear(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Black or white, whichever reads better on the given #rrggbb background.
export function textColorOn(background: string): "#000" | "#fff" {
  return contrastRatio(background, "#000000") >= contrastRatio(background, "#ffffff") ? "#000" : "#fff";
}
