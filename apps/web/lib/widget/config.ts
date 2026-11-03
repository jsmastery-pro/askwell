// The widget config a public key resolves to (project.md §6.5, §8 `GET
// /api/widget/config`). Used by the public config route and by the /embed
// panel (server-side), so both always show the same plan-applied config.
//
// The service client is right here (§9 "Tenant leak", "Public key abuse"):
// this is a public read with no owner, the key only identifies a project,
// and the result holds no owner data, only the 6 WidgetSettings fields.
import "server-only";
import {
  applyPlanToWidgetConfig,
  DEFAULT_WIDGET_CONFIG,
  PLANS,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
  type WidgetSettings,
} from "@askwell/shared";
import { createServiceClient } from "../supabase/service";

/** The project's config or plan couldn't be read. */
export class WidgetConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WidgetConfigError";
  }
}

type StoredConfig = {
  button_color: string;
  position: string;
  label: string;
  animation: string;
  header_text: string;
  show_badge: boolean;
};

/** Narrows a stored `widget_configs` row (text columns with check constraints) to WidgetSettings. */
function toSettings(row: StoredConfig): WidgetSettings {
  const position = WIDGET_POSITIONS.find((p) => p === row.position);
  const animation = WIDGET_ANIMATIONS.find((a) => a === row.animation);
  if (!position || !animation) throw new WidgetConfigError("Stored widget config has an unknown value.");
  return {
    button_color: row.button_color,
    position,
    label: row.label,
    animation,
    header_text: row.header_text,
    show_badge: row.show_badge,
  };
}

/**
 * The plan-applied widget config for a public key, or null if no project has
 * that key. Free gets the defaults for every locked field and the badge
 * (`applyPlanToWidgetConfig`). One query: the project by `public_key`, with
 * its `widget_configs` row and its owner's `accounts.plan` embedded.
 *
 * Server only. Throws WidgetConfigError if the database can't be read.
 */
export async function getPublicWidgetConfig(key: string): Promise<WidgetSettings | null> {
  const { data, error } = await createServiceClient()
    .from("projects")
    .select(
      "widget_configs(button_color, position, label, animation, header_text, show_badge), accounts(plan)",
    )
    .eq("public_key", key)
    .maybeSingle();

  if (error) throw new WidgetConfigError("Couldn't read the widget config.", { cause: error });
  if (!data) return null;

  // Every project gets its config row when it's created (§6.3). If one is
  // ever missing, show the defaults rather than no button.
  const stored = data.widget_configs ? toSettings(data.widget_configs) : { ...DEFAULT_WIDGET_CONFIG };
  // Narrowed here rather than with lib/accounts' parsePlan, which would pull
  // Clerk into this public, auth-free path.
  const plan = PLANS.find((p) => p === data.accounts.plan);
  if (!plan) throw new WidgetConfigError(`Unknown plan "${data.accounts.plan}".`);
  return applyPlanToWidgetConfig(stored, plan);
}
