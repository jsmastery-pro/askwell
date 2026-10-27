import { applyPlanToConfig, type StoredWidgetConfig, type WidgetConfig } from "@askwell/shared";
import { createServiceClient } from "../supabase/service";
import { unwrap } from "../supabase/query";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Plan-applied widget config for a public key, or null if no project has it.
 * Resolves by public_key only; returns nothing about the project or its owner. Visitors have no
 * Supabase key of their own (SB-T05), so this always runs as the service client.
 */
export async function getWidgetConfigByKey(key: string, service: ServiceClient = createServiceClient()): Promise<WidgetConfig | null> {
  const project = unwrap(await service.from("projects").select("id, owner_id").eq("public_key", key).maybeSingle());
  if (!project) return null;
  const { id: projectId, owner_id: ownerId } = project;

  const [accountResult, configResult] = await Promise.all([
    service.from("accounts").select("plan").eq("clerk_user_id", ownerId).maybeSingle(),
    service
      .from("widget_configs")
      .select("button_color, position, label, animation, header_text, show_badge")
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);
  const account = unwrap(accountResult);
  const config = unwrap(configResult);

  const plan = account?.plan ?? "free";
  const stored: StoredWidgetConfig | null = config && {
    buttonColor: config.button_color,
    position: config.position,
    label: config.label,
    animation: config.animation,
    headerText: config.header_text,
    showBadge: config.show_badge,
  };
  return applyPlanToConfig(stored, plan);
}
