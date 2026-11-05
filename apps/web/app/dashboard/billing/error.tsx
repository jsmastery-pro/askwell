"use client";

import posthog from "posthog-js";
import { useEffect } from "react";
import { Button, ErrorState, GlassPanel } from "../../../components/ui";

interface BillingErrorProps {
  error: unknown;
  retry: () => void;
}

/** The plan couldn't be read. The page header and sidebar stay. */
export default function BillingError({ error, retry }: BillingErrorProps) {
  useEffect(() => {
    console.error(error);
    // Caught here, so it never reaches window.onerror: report it ourselves (as the dashboard boundary does).
    if (posthog.__loaded) posthog.captureException(error);
  }, [error]);

  return (
    <GlassPanel padding="none">
      <ErrorState
        title="Billing didn't load"
        message="We couldn't read your plan. Try again in a moment."
        action={
          <Button variant="secondary" onClick={() => retry()}>
            Try again
          </Button>
        }
      />
    </GlassPanel>
  );
}
