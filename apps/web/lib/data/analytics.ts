import "server-only";
import { PLAN_LIMITS, type Plan } from "@askwell/shared";
import { SUMMARY_COLUMNS, summaryOf, withPreview } from "../conversations";
import { listProjects } from "../projects";
import { createOwnerClient, type OwnerClient } from "../supabase/owner";
import { isoTimestamp, unwrap, unwrapRow } from "../supabase/query";
import { getAccountPlan } from "./billing";
import { addOneMonth, type ProjectUsageRow } from "./usage";

export const RANGES = ["7d", "30d", "90d"] as const;
export type Range = (typeof RANGES)[number];
export const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** The `?range=` value if it's one we offer, otherwise 30 days. */
export function parseRange(value: unknown): Range {
  return RANGES.find((range) => range === value) ?? "30d";
}

export type Totals = { messages: number; conversations: number; visitors: number };
export type DayCount = { day: string; messages: number };
export type RecentChat = {
  projectId: string;
  projectName: string;
  conversationId: string;
  preview: string;
  createdAt: string;
};

export type Dashboard = {
  plan: Plan;
  projectCount: number;
  projectLimit: number;
  /** Every project's usage this month, oldest project first. */
  usage: ProjectUsageRow[];
  /** One entry per UTC day in the range, oldest first. */
  daily: DayCount[];
  current: Totals;
  /** The period of the same length just before the range. */
  previous: Totals;
  recentChats: RecentChat[];
};

const DAY_MS = 86_400_000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const startOfUtcDay = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

/** The `days` UTC days ending `endOffset` days before `now`, oldest first. */
function daysBack(now: Date, days: number, endOffset = 0): string[] {
  return Array.from({ length: days }, (_, i) => isoDay(new Date(now.getTime() - (endOffset + days - 1 - i) * DAY_MS)));
}

/**
 * Messages, distinct conversations with at least one message, and distinct visitors across those
 * conversations in `[start, end]`, plus messages per UTC day. owner_activity runs as the signed-in
 * owner, so RLS limits it to their own projects (PostgREST can't group or count distinct values).
 */
async function activity(start: Date, end: Date, client: OwnerClient): Promise<Totals & { daily: Record<string, number> }> {
  const row = unwrapRow(
    await client.rpc("owner_activity", { p_start: start.toISOString(), p_end: end.toISOString() }).single(),
  );
  const daily = (row.daily ?? {}) as Record<string, number>;
  return { messages: row.messages, conversations: row.conversations, visitors: row.visitors, daily };
}

/** The `limit` newest conversations across the owner's projects, with a preview and project name. */
async function recentChats(limit: number, client: OwnerClient): Promise<RecentChat[]> {
  const rows = unwrap(
    await withPreview(client.from("conversations").select(`id, project_id, created_at, project:projects(name), ${SUMMARY_COLUMNS}`))
      .order("created_at", { ascending: false })
      .limit(limit),
  );

  return (rows ?? []).map((row) => ({
    conversationId: row.id,
    projectId: row.project_id,
    projectName: row.project?.name ?? "",
    preview: summaryOf(row).preview,
    createdAt: isoTimestamp(row.created_at),
  }));
}

/** The owner's dashboard: plan, project count and usage, plus activity aggregated from their own projects' messages/conversations. */
export async function getDashboard(
  range: Range,
  now: Date = new Date(),
  client: OwnerClient = createOwnerClient(),
): Promise<Dashboard> {
  const [rows, plan] = await Promise.all([listProjects(client), getAccountPlan(client)]);
  const limits = PLAN_LIMITS[plan];
  const days = RANGE_DAYS[range];

  const currentDays = daysBack(now, days);
  const previousDays = daysBack(now, days, days);
  const currentStart = startOfUtcDay(currentDays[0]!);
  const previousStart = startOfUtcDay(previousDays[0]!);
  const previousEnd = new Date(currentStart.getTime() - 1);

  const [current, previous, recent] = await Promise.all([
    activity(currentStart, now, client),
    activity(previousStart, previousEnd, client),
    recentChats(5, client),
  ]);

  return {
    plan,
    projectCount: rows.length,
    projectLimit: limits.projects,
    usage: rows.map((row) => ({
      id: row.id,
      name: row.name,
      plan,
      messagesUsed: row.messages_used,
      messagesLimit: limits.messagesPerMonth,
      periodStart: isoTimestamp(row.period_start),
      resetsAt: addOneMonth(new Date(row.period_start)).toISOString(),
    })),
    daily: currentDays.map((day) => ({ day, messages: current.daily[day] ?? 0 })),
    current: { messages: current.messages, conversations: current.conversations, visitors: current.visitors },
    previous: { messages: previous.messages, conversations: previous.conversations, visitors: previous.visitors },
    recentChats: recent,
  };
}
