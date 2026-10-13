// Fixed locale and time zone so server and client render the same string.
const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});
const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

export const formatDateTime = (iso: string) => `${dateTime.format(new Date(iso))} UTC`;
export const formatDate = (iso: string) => date.format(new Date(iso));
export const formatCount = (n: number) => n.toLocaleString("en-US");
