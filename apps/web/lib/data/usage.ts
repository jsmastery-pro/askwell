import "server-only";
import { accounts, projects } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import { PLAN_LIMITS, type Plan, type Project } from "@askwell/shared";
import { and, eq } from "drizzle-orm";

export type ProjectUsage = Pick<Project, "messagesUsed" | "periodStart"> & {
  plan: Plan;
  messagesLimit: number;
  resetsAt: string;
};

// Real: messages_used counts from period_start and resets monthly (project.md §6.12).
export async function getProjectUsage(
  ownerId: string,
  projectId: string,
  database: Database = defaultDb,
): Promise<ProjectUsage | null> {
  const [row] = await database
    .select({ messagesUsed: projects.messagesUsed, periodStart: projects.periodStart, plan: accounts.plan })
    .from(projects)
    .innerJoin(accounts, eq(accounts.clerkUserId, projects.ownerId))
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .limit(1);
  if (!row) return null;

  return {
    plan: row.plan,
    messagesUsed: row.messagesUsed,
    messagesLimit: PLAN_LIMITS[row.plan].messagesPerMonth,
    periodStart: row.periodStart.toISOString(),
    resetsAt: addOneMonth(row.periodStart).toISOString(),
  };
}

// Same day next month, clamped to the month's last day (Jan 31 → Feb 28/29, not Mar 3).
export function addOneMonth(date: Date): Date {
  const next = new Date(date);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return next;
}
