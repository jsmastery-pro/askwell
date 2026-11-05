// Security headers for every response (project.md §9 Clickjacking, §6.5).
// next.config.ts serves these from headers().
//
// Every route gets nosniff and the referrer policy. Every route except /embed
// also may only be framed by this site (frame-ancestors 'self' and the legacy
// X-Frame-Options). /embed is the widget panel, so customers' sites must be
// able to frame it.
//
// Not a full CSP: script-src and friends need careful allowlists for Clerk and
// PostHog, which is out of scope here.

export type HeaderRule = {
  source: string;
  headers: { key: string; value: string }[];
};

/** Sent on every route, /embed included. */
export const BASE_SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
] as const;

/** Sent on every route except /embed: only this site may frame it. */
export const FRAME_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
] as const;

/** Every path. */
export const ALL_PATHS = "/:path*";

/**
 * Every path except /embed and /embed/…. A path-to-regexp source whose one
 * unnamed group is a plain regular expression, so tests can compile it as one.
 * `(?:/|$)` ends the segment, so /embedded isn't exempt.
 */
export const ALL_BUT_EMBED = "/((?!embed(?:/|$)).*)";

export function securityHeaderRules(): HeaderRule[] {
  return [
    { source: ALL_PATHS, headers: [...BASE_SECURITY_HEADERS] },
    { source: ALL_BUT_EMBED, headers: [...FRAME_HEADERS] },
  ];
}
