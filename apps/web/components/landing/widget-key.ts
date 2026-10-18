import { publicKeySchema } from "@askwell/shared";

/**
 * The public key of the Askwell project the landing page's own widget runs on (§6.1). Read at
 * request time (bracket access) because InstaCloud injects env only at runtime. Unset or
 * malformed → null, and the landing page shows no widget.
 */
export function landingWidgetKey(env: Record<string, string | undefined> = process.env): string | null {
  const parsed = publicKeySchema.safeParse(env["LANDING_WIDGET_KEY"]?.trim());
  return parsed.success ? parsed.data : null;
}
