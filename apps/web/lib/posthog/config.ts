// Shared by the browser init (instrumentation-client.ts) and the server: no server-only imports here.

export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/** GET /api/posthog-config. `key` is PostHog's project key, which is public by design. */
export type PostHogConfigResponse = { key: string | null; host: string };

/** /embed runs inside customers' sites: no PostHog there, so visitors and their chats are never captured. */
export const isEmbedPath = (path: string) => path === "/embed" || path.startsWith("/embed/");

/** Session replay only on the landing page and the dashboard (project.md §6.11). */
export const recordsReplay = (path: string) => path === "/" || path === "/dashboard" || path.startsWith("/dashboard/");
