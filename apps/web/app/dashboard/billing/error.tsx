"use client";

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
