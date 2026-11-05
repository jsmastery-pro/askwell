// Browser PostHog (project.md §6.11). Next runs this once per page load,
// before the app hydrates.
//
// - Never on /embed: that page runs inside customers' sites, and we don't
//   track or record their visitors. /embed is only ever a full page load in
//   an iframe, so checking the first path is enough.
// - Pageviews: `defaults` captures them on App Router (history) navigation.
// - Session replay: landing page and dashboard only, all inputs masked.
// - Error tracking: uncaught errors and unhandled rejections. Errors caught by
//   error boundaries are sent from app/dashboard/error.tsx and global-error.tsx.
import posthog from "posthog-js";
import { browserHosts } from "./lib/analytics/hosts";
import { isEmbedPath, isReplayPath } from "./lib/analytics/paths";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

const enabled = Boolean(key && host) && !isEmbedPath(window.location.pathname);

/** Starts or stops replay to match the page. */
function syncReplay(pathname: string): void {
  if (isReplayPath(pathname)) {
    if (!posthog.sessionRecordingStarted()) posthog.startSessionRecording();
  } else if (posthog.sessionRecordingStarted()) {
    posthog.stopSessionRecording();
  }
}

if (enabled && key && host) {
  posthog.init(key, {
    ...browserHosts(host),
    defaults: "2026-08-30",
    capture_exceptions: true,
    // Off by default; syncReplay turns it on for the landing page and dashboard.
    disable_session_recording: true,
    session_recording: { maskAllInputs: true },
    loaded: () => syncReplay(window.location.pathname),
  });
}

export function onRouterTransitionStart(url: string): void {
  if (!enabled) return;
  syncReplay(new URL(url, window.location.href).pathname);
}
