// Where PostHog runs in the browser (project.md §6.11).

/**
 * The widget panel (/embed, /embed/…) runs inside customers' sites. We never
 * initialize PostHog there: we don't track or record their visitors.
 */
export function isEmbedPath(pathname: string): boolean {
  return pathname === "/embed" || pathname.startsWith("/embed/");
}

/** Session replay runs only on the landing page and the dashboard. */
export function isReplayPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}
