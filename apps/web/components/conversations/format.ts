// Times on the Conversations screens. Relative times are measured from a
// `now` passed in (the server's clock on first render), and absolute times
// use UTC with a fixed locale, so server and browser renders match.
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Nov 4, 2026, 8:06 PM UTC". */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `${dateTimeFormat.format(date)} UTC`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date ("Oct 3, 2026"). */
export function relativeTime(iso: string, now: string): string {
  const then = new Date(iso).getTime();
  const at = new Date(now).getTime();
  if (Number.isNaN(then) || Number.isNaN(at)) return "";
  const ago = Math.max(0, at - then);
  if (ago < MINUTE) return "just now";
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)} min ago`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)} h ago`;
  const days = Math.floor(ago / DAY);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return dateFormat.format(new Date(then));
}

/** "1 message", "12 messages". */
export const messageCountText = (n: number) => `${n.toLocaleString("en-US")} message${n === 1 ? "" : "s"}`;
