import "server-only";
import { conversations, messages, projects } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import { PLAN_LIMITS, type Plan } from "@askwell/shared";
import { and, count, countDistinct, desc, eq, gte, lte, sql } from "drizzle-orm";
import { listProjects } from "../projects";
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

// Grouped day, in UTC, as `YYYY-MM-DD` — matches `isoDay`'s format so counts line up with it.
const dayExpr = sql<string>`to_char(${messages.createdAt} at time zone 'utc', 'YYYY-MM-DD')`;

// Correlated subquery: the body of a conversation's earliest visitor message, or null.
const previewColumn = sql<string | null>`(
  select ${messages.body}
  from ${messages}
  where ${messages.conversationId} = ${conversations.id} and ${messages.role} = 'visitor'
  order by ${messages.createdAt} asc
  limit 1
)`;

/** Messages per UTC day in `[start, end]`, scoped to the owner's projects, zero-filled for `days`. */
async function dailyMessageCounts(
  ownerId: string,
  days: string[],
  start: Date,
  end: Date,
  database: Database,
): Promise<DayCount[]> {
  const rows = await database
    .select({ day: dayExpr, messages: count() })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(projects, eq(projects.id, conversations.projectId))
    .where(and(eq(projects.ownerId, ownerId), gte(messages.createdAt, start), lte(messages.createdAt, end)))
    .groupBy(dayExpr);

  const counts = new Map(rows.map((row) => [row.day, row.messages]));
  return days.map((day) => ({ day, messages: counts.get(day) ?? 0 }));
}

/**
 * Messages, distinct conversations with at least one message, and distinct visitors across
 * those conversations, all in `[start, end]` and scoped to the owner's projects.
 */
async function periodTotals(ownerId: string, start: Date, end: Date, database: Database): Promise<Totals> {
  const [row] = await database
    .select({
      messages: count(messages.id),
      conversations: countDistinct(conversations.id),
      visitors: countDistinct(conversations.visitorId),
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(projects, eq(projects.id, conversations.projectId))
    .where(and(eq(projects.ownerId, ownerId), gte(messages.createdAt, start), lte(messages.createdAt, end)));
  return row ?? { messages: 0, conversations: 0, visitors: 0 };
}

/** The `limit` newest conversations across the owner's projects, with a preview and project name. */
async function recentChats(ownerId: string, limit: number, database: Database): Promise<RecentChat[]> {
  const rows = await database
    .select({
      conversationId: conversations.id,
      projectId: projects.id,
      projectName: projects.name,
      createdAt: conversations.createdAt,
      preview: previewColumn,
    })
    .from(conversations)
    .innerJoin(projects, eq(projects.id, conversations.projectId))
    .where(eq(projects.ownerId, ownerId))
    .orderBy(desc(conversations.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    conversationId: row.conversationId,
    projectId: row.projectId,
    projectName: row.projectName,
    preview: row.preview ?? "",
    createdAt: row.createdAt.toISOString(),
  }));
}

/** The owner's dashboard: plan, project count and usage, plus activity aggregated from their own projects' messages/conversations. */
export async function getDashboard(
  ownerId: string,
  range: Range,
  now: Date = new Date(),
  database: Database = defaultDb,
): Promise<Dashboard> {
  const [rows, plan] = await Promise.all([listProjects(ownerId, database), getAccountPlan(ownerId, database)]);
  const limits = PLAN_LIMITS[plan];
  const days = RANGE_DAYS[range];

  const currentDays = daysBack(now, days);
  const previousDays = daysBack(now, days, days);
  const currentStart = startOfUtcDay(currentDays[0]!);
  const previousStart = startOfUtcDay(previousDays[0]!);
  const previousEnd = new Date(currentStart.getTime() - 1);

  const [daily, current, previous, recent] = await Promise.all([
    dailyMessageCounts(ownerId, currentDays, currentStart, now, database),
    periodTotals(ownerId, currentStart, now, database),
    periodTotals(ownerId, previousStart, previousEnd, database),
    recentChats(ownerId, 5, database),
  ]);

  return {
    plan,
    projectCount: rows.length,
    projectLimit: limits.projects,
    usage: rows.map((row) => ({
      id: row.id,
      name: row.name,
      plan,
      messagesUsed: row.messagesUsed,
      messagesLimit: limits.messagesPerMonth,
      periodStart: row.periodStart.toISOString(),
      resetsAt: addOneMonth(row.periodStart).toISOString(),
    })),
    daily,
    current,
    previous,
    recentChats: recent,
  };
}
