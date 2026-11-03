// Which routes need a Clerk session (docs/project.md §6.2, §8).
//
// The proxy uses this to send signed-out visitors to sign-in early. It is not
// the only check: every owner page, Route Handler and Server Function must
// also check auth itself, because the proxy matches on URL paths only.

export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";
/** Where owners land after signing in or signing up. */
export const AFTER_AUTH_PATH = "/dashboard";
/** Where owners land after signing out. */
export const AFTER_SIGN_OUT_PATH = SIGN_IN_PATH;

/** Owner pages: a signed-out request is redirected to sign-in. */
const OWNER_PAGE_PREFIXES = ["/dashboard"] as const;

/** Owner API routes: a signed-out request gets 401. */
const OWNER_API_PREFIXES = ["/api/projects", "/api/knowledge", "/api/conversations"] as const;

export type RouteAccess = "owner-page" | "owner-api" | "public";

// Same as `/dashboard(.*)`: a plain prefix match, so anything that starts with
// a protected prefix is protected (fail closed).
const startsWithAny = (pathname: string, prefixes: readonly string[]) =>
  prefixes.some((prefix) => pathname.startsWith(prefix));

/**
 * Classify a request path. Everything not listed as owner is public.
 * (The widget's /embed and /widget.js never reach the proxy: its matcher
 * skips them, so Clerk doesn't run there at all.)
 */
export function routeAccess(pathname: string): RouteAccess {
  if (startsWithAny(pathname, OWNER_API_PREFIXES)) return "owner-api";
  if (startsWithAny(pathname, OWNER_PAGE_PREFIXES)) return "owner-page";
  return "public";
}
