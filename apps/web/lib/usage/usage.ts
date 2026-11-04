// A project's message usage this month (project.md §5, §6.12), for display.
// The count lives on projects.messages_used, counted by consume_message() in
// Postgres, which starts a new period lazily: the first message on or after
// period_start + 1 month resets the count. So a stored count can be stale;
// this mirrors that rule. Pure: the caller passes the plan (read on the
// server) and the server's clock.
import { PLAN_LIMITS, type Plan, type Project } from "@askwell/shared";

export type Usage = {
  /** Messages counted this period, clamped to [0, limit]. */
  used: number;
  /** PLAN_LIMITS[plan].messagesPerMonth. */
  limit: number;
  /**
   * When the current period ends (ISO). Null when it already has: the next
   * visitor message starts a new month, so the end isn't known yet.
   */
  resetsAt: string | null;
  /** The widget is answering visitors with the quota message. */
  atLimit: boolean;
};

/**
 * `iso` plus one calendar month in UTC, the way Postgres adds
 * `interval '1 month'` (Supabase runs in UTC): same day and time next month,
 * clamped to that month's last day (Jan 31 → Feb 28 or 29).
 */
export function addOneMonth(iso: string): Date {
  const start = new Date(iso);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(start.getUTCDate(), lastDay),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
}

export function projectUsage(
  project: Pick<Project, "messages_used" | "period_start">,
  plan: Plan,
  now: Date,
): Usage {
  const limit = PLAN_LIMITS[plan].messagesPerMonth;
  const periodEnd = addOneMonth(project.period_start);
  // Same test as consume_message(): period_start + 1 month <= now → a new period.
  const rolledOver = periodEnd.getTime() <= now.getTime();
  const stored = rolledOver ? 0 : project.messages_used;
  // A downgrade can leave more counted than the new limit allows: show it as full.
  const used = Math.min(Math.max(stored, 0), limit);
  return {
    used,
    limit,
    resetsAt: rolledOver ? null : periodEnd.toISOString(),
    atLimit: used >= limit,
  };
}
