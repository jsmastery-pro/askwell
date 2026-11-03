// Start-up, separate from the DOM so it can be tested: read the script tag,
// fetch the config, then mount. Any problem → nothing renders.
import type { WidgetSettings } from "@askwell/shared";
import { baseOriginOf, fetchConfig, isPublicKey } from "./config";

export const NOT_SHOWN = "widget.js: chat not shown (check data-key)";

/** What the loader needs from its own <script> tag. */
export interface ScriptInfo {
  src: string | null;
  key: string | null;
}

export interface BootDeps {
  fetch: typeof fetch;
  mount: (config: WidgetSettings, base: string, key: string) => void;
  warn: (message: string) => void;
}

/**
 * Mounts the widget when the script, key and config are all valid. Returns
 * whether it mounted. Warns at most once otherwise; never throws.
 */
export async function boot(script: ScriptInfo | null, deps: BootDeps): Promise<boolean> {
  const base = baseOriginOf(script?.src);
  const key = script?.key;
  const config = base && isPublicKey(key) ? await fetchConfig(base, key, deps.fetch) : null;
  if (!base || !key || !config) {
    deps.warn(NOT_SHOWN);
    return false;
  }
  deps.mount(config, base, key);
  return true;
}
