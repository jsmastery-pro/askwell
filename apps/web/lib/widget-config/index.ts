import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import { widgetConfigs } from "@askwell/db";
import {
  applyPlanToConfig,
  type Plan,
  type StoredWidgetConfig,
  type UpdateWidgetConfigRequest,
  type WidgetConfig,
} from "@askwell/shared";
import { eq } from "drizzle-orm";
// Type-only: this file is shared with the owner-side PATCH /api/projects/:id/config route
// (upsertWidgetConfig), which never touches Supabase, so it must not pick up a runtime import of
// a client only the routes below construct (getWidgetConfigByKey takes it as a required argument
// instead of defaulting it here).
import type { createServiceClient } from "@/lib/supabase/service";

const STORED_COLUMNS = {
  buttonColor: widgetConfigs.buttonColor,
  position: widgetConfigs.position,
  label: widgetConfigs.label,
  animation: widgetConfigs.animation,
  headerText: widgetConfigs.headerText,
  showBadge: widgetConfigs.showBadge,
};

type ServiceClient = ReturnType<typeof createServiceClient>;
type ProjectRow = { id: string; owner_id: string };
type ConfigRow = {
  button_color: string | null;
  position: WidgetConfig["position"];
  label: string | null;
  animation: WidgetConfig["animation"];
  header_text: string | null;
  show_badge: boolean;
};

/**
 * Plan-applied widget config for a public key, or null if no project has it.
 * Resolves by public_key only; returns nothing about the project or its owner. Visitors have no
 * Supabase key of their own (SB-T05), so this always runs as the service client.
 */
export async function getWidgetConfigByKey(key: string, service: ServiceClient): Promise<WidgetConfig | null> {
  const { data: project } = await service.from("projects").select("id, owner_id").eq("public_key", key).maybeSingle();
  if (!project) return null;
  const { id: projectId, owner_id: ownerId } = project as ProjectRow;

  const [{ data: account }, { data: config }] = await Promise.all([
    service.from("accounts").select("plan").eq("clerk_user_id", ownerId).maybeSingle(),
    service
      .from("widget_configs")
      .select("button_color, position, label, animation, header_text, show_badge")
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);

  const plan = (account as { plan: Plan } | null)?.plan ?? "free";
  const row = config as ConfigRow | null;
  const stored: StoredWidgetConfig | null = row && {
    buttonColor: row.button_color,
    position: row.position,
    label: row.label,
    animation: row.animation,
    headerText: row.header_text,
    showBadge: row.show_badge,
  };
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
