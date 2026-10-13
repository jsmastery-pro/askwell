export type UsageLevel = "ok" | "warning" | "limit";

/** Warn from 80 % of the monthly limit; at the limit the widget stops replying. */
export function usageLevel(used: number, limit: number): UsageLevel {
  if (used >= limit) return "limit";
  return used >= limit * 0.8 ? "warning" : "ok";
}

/**
 * Usage as of `now`. The chat route resets the count lazily, on the first message after the
 * period ends (P3-T05). Until then the stored count is last month's, so it shows as 0.
 */
export function currentUsage(used: number, resetsAt: string, now: string): { used: number; periodEnded: boolean } {
  const periodEnded = Date.parse(now) >= Date.parse(resetsAt);
  return { used: periodEnded ? 0 : used, periodEnded };
}
