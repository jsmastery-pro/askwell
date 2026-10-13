import "server-only";
import { db as defaultDb } from "@askwell/db/client";
import type { Database, ProjectRow } from "@askwell/db/queries";
import { PLAN_LIMITS, type Plan } from "@askwell/shared";
import { mockConversationsFor, mockMessagesOn, mockVisitorsFor } from "../mock/analytics";
import { MOCK_THREADS } from "../mock/conversations";
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
  /** Real: every project's usage this month, oldest project first. */
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

/** The `days` UTC days ending `endOffset` days before `now`, oldest first. */
function daysBack(now: Date, days: number, endOffset = 0): string[] {
  return Array.from({ length: days }, (_, i) => isoDay(new Date(now.getTime() - (endOffset + days - 1 - i) * DAY_MS)));
}

/**
 * The owner's dashboard. Only ever reads this owner's projects; the plan, project count and
 * usage are real, the activity and recent chats are demo data hung off those real projects.
 */
export async function getDashboard(
  ownerId: string,
  range: Range,
  now: Date = new Date(),
  database: Database = defaultDb,
): Promise<Dashboard> {
  const [rows, plan] = await Promise.all([listProjects(ownerId, database), getAccountPlan(ownerId, database)]);
  const limits = PLAN_LIMITS[plan];
  const days = RANGE_DAYS[range];
  const daily = mockDailyMessages(rows, daysBack(now, days));

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
    current: totals(daily),
    previous: totals(mockDailyMessages(rows, daysBack(now, days, days))),
    recentChats: mockRecentChats(rows),
  };
}

/**
 * A new project has had no chats yet: demo activity starts the day after it was created.
 * MOCK: owner analytics query over messages/conversations (wiring task TBD by John)
 */
export function mockDailyMessages(projects: ProjectRow[], days: string[]): DayCount[] {
  return days.map((day) => ({
    day,
    messages: projects
      .filter((project) => day > isoDay(project.createdAt))
      .reduce((sum, project) => sum + mockMessagesOn(project.id, day), 0),
  }));
}

function totals(daily: DayCount[]): Totals {
  const messages = daily.reduce((sum, day) => sum + day.messages, 0);
  const conversations = daily.reduce((sum, day) => sum + mockConversationsFor(day.messages), 0);
  return { messages, conversations, visitors: mockVisitorsFor(conversations) };
}

/**
 * The 5 newest chats across the owner's projects. The shared fixtures are spread over the
 * owner's real projects (so each link opens that project's thread page), and a chat never
 * predates its project.
 * MOCK: owner analytics query over messages/conversations (wiring task TBD by John)
 */
export function mockRecentChats(projects: ProjectRow[]): RecentChat[] {
  if (projects.length === 0) return [];
  const byAge = [...projects].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return MOCK_THREADS.flatMap((thread, i) => {
    const project = byAge[i % byAge.length]!;
    if (Date.parse(thread.createdAt) <= project.createdAt.getTime()) return [];
    return [
      {
        projectId: project.id,
        projectName: project.name,
        conversationId: thread.id,
        preview: thread.messages.find((message) => message.role === "visitor")?.body ?? "",
        createdAt: thread.createdAt,
      },
    ];
  })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);
}
