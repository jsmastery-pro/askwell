// Matches the widget's button (apps/widget/src/styles.ts) without importing
// the widget bundle.

/** Black or white text on `hex` (#rrggbb), by perceived brightness (YIQ), as the widget does. */
export function textColorOn(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return "#fff";
  const c = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return c(1) * 299 + c(3) * 587 + c(5) * 114 > 150_000 ? "#000" : "#fff";
}
