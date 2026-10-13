const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

// "just now", "5 minutes ago", "yesterday", "3 weeks ago".
export function formatRelative(iso: string, now: Date): string {
  const seconds = Math.round((Date.parse(iso) - now.getTime()) / 1000);
  if (Math.abs(seconds) < 60) return "just now";
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return relative.format(Math.round(seconds / 60), "minute");
}

// Visitor IDs are long random strings; the last 6 characters are enough to tell chats apart.
export function visitorLabel(visitorId: string): string {
  const tail = visitorId.replace(/^v_/, "").slice(-6);
  return `Visitor ${tail || visitorId}`;
}
