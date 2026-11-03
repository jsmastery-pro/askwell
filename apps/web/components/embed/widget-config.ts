// TEMPORARY stand-in for Dwight's A1 `getPublicWidgetConfig` in
// apps/web/lib/widget/config.ts, with the exact same signature. When A1
// merges, the embed page imports the real one and this file is deleted.
import { DEFAULT_WIDGET_CONFIG, publicKeySchema, type WidgetSettings } from "@askwell/shared";

/**
 * The plan-applied widget config for a public key, or null when the key is
 * invalid or unknown. Mock: any well-formed key gets the Free defaults.
 */
export async function getPublicWidgetConfig(key: string): Promise<WidgetSettings | null> {
  if (!publicKeySchema.safeParse(key).success) return null;
  return { ...DEFAULT_WIDGET_CONFIG };
}
