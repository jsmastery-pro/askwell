import type { Instrumentation } from "next";

// Server errors (render, route handlers, server actions, proxy) to PostHog
// Error tracking (project.md §6.11). Node runtime only: posthog-node.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const [{ captureServerException }, { distinctIdFromCookies }] = await Promise.all([
      import("./lib/analytics/server"),
      import("./lib/analytics/distinct-id"),
    ]);
    await captureServerException(
      error,
      distinctIdFromCookies(request.headers.cookie, process.env.NEXT_PUBLIC_POSTHOG_KEY),
      {
        // The path without its query: queries may carry keys.
        path: request.path.split("?")[0] ?? request.path,
        method: request.method,
        route_path: context.routePath,
        route_type: context.routeType,
      },
    );
  } catch (reportError) {
    console.error("PostHog onRequestError failed", reportError);
  }
};
