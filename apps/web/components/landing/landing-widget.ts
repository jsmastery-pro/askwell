import { publicKeySchema } from "@askwell/shared";

// The landing page's own widget (project.md §6.1, §11): the public key of the
// house project about Askwell, from LANDING_WIDGET_KEY. Each environment has
// its own key and the build is promoted unchanged, so it's read on the server
// at request time, never at build time and never through NEXT_PUBLIC_*.

const KEY_VAR = "LANDING_WIDGET_KEY";

/** The landing widget's public key, or null when it's unset or not a valid key. */
export function landingWidgetKey(env: Record<string, string | undefined> = process.env): string | null {
  const parsed = publicKeySchema.safeParse(env[KEY_VAR]?.trim());
  return parsed.success ? parsed.data : null;
}
