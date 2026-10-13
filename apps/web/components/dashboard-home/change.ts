export type Change = { label: string; direction: "up" | "down" | "flat" | "new" };

/** "+18%", "−5%", "0%", or "New" when the previous period had none. Null when both are 0. */
export function describeChange(current: number, previous: number): Change | null {
  if (previous === 0) return current === 0 ? null : { label: "New", direction: "new" };
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return { label: "0%", direction: "flat" };
  return percent > 0 ? { label: `+${percent}%`, direction: "up" } : { label: `−${Math.abs(percent)}%`, direction: "down" };
}
