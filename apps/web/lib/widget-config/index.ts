import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import { accounts, projects, widgetConfigs } from "@askwell/db";
import { applyPlanToConfig, type WidgetConfig } from "@askwell/shared";
import { eq } from "drizzle-orm";

/**
 * Plan-applied widget config for a public key, or null if no project has it.
 * Resolves by public_key only; returns nothing about the project or its owner.
 */
export async function getWidgetConfigByKey(
  key: string,
  database: Database = defaultDb,
): Promise<WidgetConfig | null> {
  const [row] = await database
    .select({
      plan: accounts.plan,
      configProjectId: widgetConfigs.projectId,
      buttonColor: widgetConfigs.buttonColor,
      position: widgetConfigs.position,
      label: widgetConfigs.label,
      animation: widgetConfigs.animation,
      headerText: widgetConfigs.headerText,
      showBadge: widgetConfigs.showBadge,
    })
    .from(projects)
    .innerJoin(accounts, eq(accounts.clerkUserId, projects.ownerId))
    .leftJoin(widgetConfigs, eq(widgetConfigs.projectId, projects.id))
    .where(eq(projects.publicKey, key))
    .limit(1);

  if (!row) return null;

  const { plan, configProjectId, position, animation, showBadge, ...text } = row;
  const stored =
    configProjectId && position && animation && showBadge !== null
      ? { ...text, position, animation, showBadge }
      : null;
  return applyPlanToConfig(stored, plan);
}
