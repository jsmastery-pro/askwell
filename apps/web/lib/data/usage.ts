import "server-only";
import { PLAN_LIMITS, type Plan, type Project } from "@askwell/shared";
import { createOwnerClient, type OwnerClient } from "../supabase/owner";
import { isoTimestamp, unwrap } from "../supabase/query";
import { isUuid } from "./ids";

export type ProjectUsage = Pick<Project, "messagesUsed" | "periodStart"> & {
  plan: Plan;
  messagesLimit: number;
  resetsAt: string;
};

// The project's columns plus its owner's plan, through the projects → accounts foreign key. RLS
// returns only the signed-in owner's projects and account.
const USAGE_COLUMNS = "id, name, messages_used, period_start, account:accounts(plan)";

type UsageRow = { messages_used: number; period_start: string; account: { plan: Plan } | null };

// Real: messages_used counts from period_start and resets monthly (project.md §6.12). Null if the
// project doesn't exist or isn't the signed-in owner's.
export async function getProjectUsage(projectId: string, client: OwnerClient = createOwnerClient()): Promise<ProjectUsage | null> {
  if (!isUuid(projectId)) return null;
  const row = unwrap(await client.from("projects").select(USAGE_COLUMNS).eq("id", projectId).maybeSingle());
  return row ? toUsage(row) : null;
}

export type ProjectUsageRow = ProjectUsage & Pick<Project, "id" | "name">;

// Real: every project the signed-in owner has, oldest first (the Projects page order), with its usage.
export async function listProjectUsage(client: OwnerClient = createOwnerClient()): Promise<ProjectUsageRow[]> {
  const rows = unwrap(await client.from("projects").select(USAGE_COLUMNS).order("created_at", { ascending: true })) ?? [];
  return rows.map((row) => ({ id: row.id, name: row.name, ...toUsage(row) }));
}

export function toUsage(row: UsageRow): ProjectUsage {
  const plan = row.account?.plan ?? "free";
  const periodStart = new Date(row.period_start);
  return {
    plan,
    messagesUsed: row.messages_used,
    messagesLimit: PLAN_LIMITS[plan].messagesPerMonth,
    periodStart: isoTimestamp(row.period_start),
    resetsAt: addOneMonth(periodStart).toISOString(),
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
