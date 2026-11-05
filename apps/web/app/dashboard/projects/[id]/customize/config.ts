// The project's stored widget config for the Customize page, read with the
// owner client: RLS lets owners SELECT `widget_configs` rows in their own
// projects only (§7, §9 "Tenant leak").
import "server-only";
import {
  DEFAULT_WIDGET_CONFIG,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
  type WidgetSettings,
} from "@askwell/shared";
import { createOwnerClient } from "../../../../../lib/supabase/owner";

export class CustomizeLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CustomizeLoadError";
  }
}

type ConfigRow = Omit<WidgetSettings, "position" | "animation"> & { position: string; animation: string };

/** Narrows the text columns (check constraints in the database) to the shared enums. */
export function parseConfig(row: ConfigRow): WidgetSettings {
  const position = WIDGET_POSITIONS.find((p) => p === row.position);
  const animation = WIDGET_ANIMATIONS.find((a) => a === row.animation);
  if (!position || !animation) throw new CustomizeLoadError("Stored widget config has an unknown value.");
  return {
    button_color: row.button_color,
    position,
    label: row.label,
    animation,
    header_text: row.header_text,
    show_badge: row.show_badge,
  };
}

/** The stored config. Every project gets a row when it's created (§6.3); if one is missing, the defaults. */
export async function loadWidgetConfig(projectId: string): Promise<WidgetSettings> {
  const owner = await createOwnerClient();
  const { data, error } = await owner
    .from("widget_configs")
    .select("button_color, position, label, animation, header_text, show_badge")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new CustomizeLoadError("Couldn't read the widget config.", { cause: error });
  return data ? parseConfig(data) : { ...DEFAULT_WIDGET_CONFIG };
}
