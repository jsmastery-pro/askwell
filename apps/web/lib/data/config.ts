import "server-only";
import { accounts, projects, widgetConfigs } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import { applyPlanToConfig, type Plan, type StoredWidgetConfig, type WidgetConfig } from "@askwell/shared";
import { and, eq } from "drizzle-orm";

// Real reads, scoped by owner: another owner's project returns nothing.

export async function getStoredWidgetConfig(
  ownerId: string,
  projectId: string,
  database: Database = defaultDb,
): Promise<StoredWidgetConfig | null> {
  const [row] = await database
    .select({
      buttonColor: widgetConfigs.buttonColor,
      position: widgetConfigs.position,
      label: widgetConfigs.label,
      animation: widgetConfigs.animation,
      headerText: widgetConfigs.headerText,
      showBadge: widgetConfigs.showBadge,
    })
    .from(widgetConfigs)
    .innerJoin(projects, eq(projects.id, widgetConfigs.projectId))
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

// What the widget renders today: the stored config with the owner's plan applied.
export async function getWidgetConfig(
  ownerId: string,
  projectId: string,
  database: Database = defaultDb,
): Promise<{ plan: Plan; stored: StoredWidgetConfig | null; config: WidgetConfig } | null> {
  const [owned] = await database
    .select({ plan: accounts.plan })
    .from(projects)
    .innerJoin(accounts, eq(accounts.clerkUserId, projects.ownerId))
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .limit(1);
  if (!owned) return null;
  const stored = await getStoredWidgetConfig(ownerId, projectId, database);
  return { plan: owned.plan, stored, config: applyPlanToConfig(stored, owned.plan) };
}
