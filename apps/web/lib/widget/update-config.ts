// Saves an owner's widget customization (project.md §6.8, PATCH
// /api/projects/:id/config).
//
// The service client is right here (§7): owners can't write `widget_configs`.
// Call it only after the route has checked that the caller owns the project
// (getOwnedProject, owner client + RLS) and that their plan is Pro (§9 "Plan
// bypass", "Tenant leak"). The write is scoped to that one project.
import "server-only";
import type { UpdateWidgetConfigBody, WidgetConfig } from "@askwell/shared";
import { createServiceClient } from "../supabase/service";
import { toSettings, WidgetConfigError } from "./config";

const COLUMNS = "project_id, button_color, position, label, animation, header_text, show_badge";

/**
 * Writes only the fields in `changes` to the project's config row and returns
 * the whole stored row. Null if the project has no config row (every project
 * gets one when it's created, §6.3). Throws WidgetConfigError if the write fails.
 */
export async function updateWidgetConfig(
  projectId: string,
  changes: UpdateWidgetConfigBody,
): Promise<WidgetConfig | null> {
  const { data, error } = await createServiceClient()
    .from("widget_configs")
    .update(changes)
    .eq("project_id", projectId)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw new WidgetConfigError("Couldn't save the widget config.", { cause: error });
  if (!data) return null;
  return { project_id: data.project_id, ...toSettings(data) };
}
