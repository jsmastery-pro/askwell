// Same WCAG rule as apps/web/components/widget-panel/contrast.ts, so the launcher
// button and the panel header always pick the same text color.
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * linear(n >> 16) + 0.7152 * linear((n >> 8) & 255) + 0.0722 * linear(n & 255);
}

// Black or white, whichever has the higher contrast ratio on the #rrggbb background.
// Against black the ratio is (L + 0.05) / 0.05; against white it is 1.05 / (L + 0.05).
export function textColorOn(background: string): "#000" | "#fff" {
  const l = luminance(background);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000" : "#fff";
}
