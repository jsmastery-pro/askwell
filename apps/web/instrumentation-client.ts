import posthog from "posthog-js";
import { notifyPostHogReady } from "./lib/posthog/client";
import { isEmbedPath, recordsReplay, type PostHogConfigResponse } from "./lib/posthog/config";

async function startPostHog() {
  // The key comes from the server at runtime (see app/api/posthog-config).
  const response = await fetch("/api/posthog-config");
  if (!response.ok) return;
  const { key, host } = (await response.json()) as PostHogConfigResponse;
  // No key (e.g. local dev without PostHog): stay uninitialized, and every posthog.* call is a no-op.
  if (!key) return;

  posthog.init(key, {
    api_host: "/ingest",
    ui_host: host.replace(".i.posthog.com", ".posthog.com"),
    // Newest preset that doesn't stream network bodies into replays.
    defaults: "2026-01-30",
    capture_exceptions: true,
    disable_session_recording: !recordsReplay(window.location.pathname),
    loaded: notifyPostHogReady,
  });

  // Client-side navigation doesn't re-run this file, so re-check replay on every pageview.
  posthog.on("eventCaptured", (event) => {
    if (event.event !== "$pageview") return;
    if (recordsReplay(window.location.pathname)) posthog.startSessionRecording();
    else posthog.stopSessionRecording();
  });
}

if (!isEmbedPath(window.location.pathname)) {
  startPostHog().catch((error: unknown) => console.error("PostHog failed to start", error));
}
