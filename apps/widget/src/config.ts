// Reading the script tag and the config response. No runtime imports from
// @askwell/shared: its schemas pull in zod, far over the 5 kb budget. The
// constants below mirror the shared ones (config.test.ts checks they match).
import type { WidgetAnimation, WidgetPosition, WidgetSettings } from "@askwell/shared";

export const POSITIONS: readonly WidgetPosition[] = ["bottom-right", "bottom-left", "top-right", "top-left"];
export const ANIMATIONS: readonly WidgetAnimation[] = ["fade", "slide", "scale"];
export const PUBLIC_KEY_MAX_LENGTH = 128;
export const LABEL_MAX_LENGTH = 40;
export const HEADER_TEXT_MAX_LENGTH = 80;

const PUBLIC_KEY = /^pk_[A-Za-z0-9_-]+$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Same rule as `publicKeySchema`: "pk_" + letters, digits, "_" or "-". */
export function isPublicKey(value: unknown): value is string {
  return typeof value === "string" && value.length <= PUBLIC_KEY_MAX_LENGTH && PUBLIC_KEY.test(value);
}

/** The script's own origin (where /api and /embed live), or null. */
export function baseOriginOf(src: string | null | undefined): string | null {
  if (!src) return null;
  try {
    const url = new URL(src);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

const isText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

/**
 * The config from a `GET /api/widget/config` body (`{ config }`), or null if
 * anything is missing or out of range. Null means: render nothing.
 */
export function parseConfigResponse(body: unknown): WidgetSettings | null {
  if (typeof body !== "object" || body === null) return null;
  const c = (body as { config?: unknown }).config;
  if (typeof c !== "object" || c === null) return null;
  const cfg = c as Record<string, unknown>;
  if (
    typeof cfg.button_color !== "string" ||
    !HEX_COLOR.test(cfg.button_color) ||
    !POSITIONS.includes(cfg.position as WidgetPosition) ||
    !ANIMATIONS.includes(cfg.animation as WidgetAnimation) ||
    !isText(cfg.label, LABEL_MAX_LENGTH) ||
    !isText(cfg.header_text, HEADER_TEXT_MAX_LENGTH) ||
    typeof cfg.show_badge !== "boolean"
  ) {
    return null;
  }
  // Only these 6 fields are ever read.
  return cfg as unknown as WidgetSettings;
}

/** Fetches the config. Null on any network error, non-200 or bad body. */
export async function fetchConfig(
  base: string,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WidgetSettings | null> {
  try {
    const res = await fetchImpl(`${base}/api/widget/config?key=${encodeURIComponent(key)}`, {
      credentials: "omit",
    });
    if (res.status !== 200) return null;
    return parseConfigResponse(await res.json());
  } catch {
    return null;
  }
}

/** The panel URL: the key, and this page's origin for postMessage. */
export function embedUrl(base: string, key: string, hostOrigin: string): string {
  return `${base}/embed?key=${encodeURIComponent(key)}&origin=${encodeURIComponent(hostOrigin)}`;
}
