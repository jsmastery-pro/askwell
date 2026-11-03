"use client";

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
