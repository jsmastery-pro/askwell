import "server-only";
import type { Tables } from "@askwell/db/types";
import {
  applyPlanToConfig,
  type Plan,
  type StoredWidgetConfig,
  type UpdateWidgetConfigRequest,
  type WidgetConfig,
} from "@askwell/shared";
import { createOwnerClient, type OwnerClient } from "../supabase/owner";
import { unwrap, unwrapRow } from "../supabase/query";
import { createServiceClient, type ServiceClient } from "../supabase/service";
import { getAccountPlan } from "./billing";
import { isUuid } from "./ids";

const STORED_COLUMNS = "button_color, position, label, animation, header_text, show_badge";

type StoredRow = Pick<
  Tables<"widget_configs">,
  "button_color" | "position" | "label" | "animation" | "header_text" | "show_badge"
>;

function toStored(row: StoredRow): StoredWidgetConfig {
  return {
    buttonColor: row.button_color,
    position: row.position,
    label: row.label,
    animation: row.animation,
    headerText: row.header_text,
    showBadge: row.show_badge,
  };
}

// Real reads through the owner client: RLS returns nothing for another owner's project.

export async function getStoredWidgetConfig(
  projectId: string,
  client: OwnerClient = createOwnerClient(),
): Promise<StoredWidgetConfig | null> {
  if (!isUuid(projectId)) return null;
  const row = unwrap(await client.from("widget_configs").select(STORED_COLUMNS).eq("project_id", projectId).maybeSingle());
  return row ? toStored(row) : null;
}

// What the widget renders today: the stored config with the owner's plan applied. Null if the
// project doesn't exist or isn't the signed-in owner's.
export async function getWidgetConfig(
  projectId: string,
  client: OwnerClient = createOwnerClient(),
): Promise<{ plan: Plan; stored: StoredWidgetConfig | null; config: WidgetConfig } | null> {
  if (!isUuid(projectId)) return null;
  const [project, plan, stored] = await Promise.all([
    client.from("projects").select("id").eq("id", projectId).maybeSingle(),
    getAccountPlan(client),
    getStoredWidgetConfig(projectId, client),
  ]);
  if (!unwrap(project)) return null;
  return { plan, stored, config: applyPlanToConfig(stored, plan) };
}

/**
 * Saves widget config changes. Owners have no write policy on widget_configs (customizing is a
 * Pro feature), so the caller checks ownership and the plan first, and this writes with the
 * service client. Only the fields in `changes` are written; the rest keep their values.
 */
export async function writeWidgetConfig(
  projectId: string,
  changes: UpdateWidgetConfigRequest,
  service: ServiceClient = createServiceClient(),
): Promise<StoredWidgetConfig> {
  const row: Partial<StoredRow> = {};
  if (changes.buttonColor !== undefined) row.button_color = changes.buttonColor;
  if (changes.position !== undefined) row.position = changes.position;
  if (changes.label !== undefined) row.label = changes.label;
  if (changes.animation !== undefined) row.animation = changes.animation;
  if (changes.headerText !== undefined) row.header_text = changes.headerText;
  if (changes.showBadge !== undefined) row.show_badge = changes.showBadge;

  // The project's row always exists (create_project inserts it); the upsert also covers one that
  // doesn't. With no changes it writes nothing new and returns the stored config.
  const saved = unwrapRow(
    await service
      .from("widget_configs")
      .upsert({ project_id: projectId, ...row }, { onConflict: "project_id" })
      .select(STORED_COLUMNS)
      .single(),
  );
  return toStored(saved);
}
