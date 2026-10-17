import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import { accounts, projects, widgetConfigs } from "@askwell/db";
import { applyPlanToConfig, type StoredWidgetConfig, type UpdateWidgetConfigRequest, type WidgetConfig } from "@askwell/shared";
import { eq } from "drizzle-orm";

const STORED_COLUMNS = {
  buttonColor: widgetConfigs.buttonColor,
  position: widgetConfigs.position,
  label: widgetConfigs.label,
  animation: widgetConfigs.animation,
  headerText: widgetConfigs.headerText,
  showBadge: widgetConfigs.showBadge,
};

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

/**
 * Applies `changes` to a project's widget config (one row per project, created with defaults
 * at project creation) and returns the row as stored. A `null` text field resets it to the
 * app default, same as the column's own null-means-default semantics. Upserts defensively,
 * though the row should already exist. Doesn't check ownership or plan — the caller does.
 */
export async function upsertWidgetConfig(
  projectId: string,
  changes: UpdateWidgetConfigRequest,
  database: Database = defaultDb,
): Promise<StoredWidgetConfig> {
  if (Object.keys(changes).length === 0) {
    const [row] = await database.select(STORED_COLUMNS).from(widgetConfigs).where(eq(widgetConfigs.projectId, projectId));
    if (row) return row;
    // No row yet (shouldn't happen — project creation always inserts one): create the default.
    const [created] = await database.insert(widgetConfigs).values({ projectId }).returning(STORED_COLUMNS);
    if (!created) throw new Error(`Widget config upsert for project ${projectId} returned no row`);
    return created;
  }

  const [row] = await database
    .insert(widgetConfigs)
    .values({ projectId, ...changes })
    .onConflictDoUpdate({ target: widgetConfigs.projectId, set: changes })
    .returning(STORED_COLUMNS);
  if (!row) throw new Error(`Widget config upsert for project ${projectId} returned no row`);
  return row;
}
