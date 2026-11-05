"use client";

import posthog from "posthog-js";
import { useEffect } from "react";
import { Button, ErrorState, GlassPanel } from "../../components/ui";

interface DashboardErrorProps {
  error: unknown;
  retry: () => void;
}

/** Shown when a dashboard page fails to render. The sidebar stays. */
export default function DashboardError({ error, retry }: DashboardErrorProps) {
  useEffect(() => {
    console.error(error);
    // Caught here, so it never reaches window.onerror: report it ourselves.
    if (posthog.__loaded) posthog.captureException(error);
  }, [error]);

  return (
    <GlassPanel padding="none">
      <ErrorState
        title="This page didn't load"
        message="Something went wrong on our side. Try again in a moment."
        action={
          <Button variant="secondary" onClick={() => retry()}>
            Try again
          </Button>
        }
      />
    </GlassPanel>
  );
}
