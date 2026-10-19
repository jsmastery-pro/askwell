"use client";

import posthog from "posthog-js";
import { useEffect } from "react";
import { posthogReady } from "../../lib/posthog/client";

/**
 * Sends an error-boundary error to PostHog. Boundaries swallow render errors, so exception
 * autocapture never sees them. PostHog starts only after its config fetch, and drops anything
 * captured before that, so the error waits for it. Where PostHog never starts (no key, or
 * /embed), nothing is sent.
 */
export function useCaptureException(error: Error) {
  useEffect(() => {
    void posthogReady.then(() => posthog.captureException(error));
  }, [error]);
}
