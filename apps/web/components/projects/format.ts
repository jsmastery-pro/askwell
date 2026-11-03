// Dates on project cards. Formatted in UTC with a fixed locale, so the server
// render and the browser render match (no hydration mismatch).
const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/** "Nov 3, 2026" for an ISO timestamp. */
export function formatCreatedDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dateFormat.format(date);
}
