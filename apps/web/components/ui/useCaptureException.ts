"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

/**
 * Sends an error-boundary error to PostHog. Boundaries swallow render errors, so exception
 * autocapture never sees them. A no-op where PostHog isn't initialized (no key, or /embed).
 */
export function useCaptureException(error: Error) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);
}
