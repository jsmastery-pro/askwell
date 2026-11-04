"use client";

import { useEffect } from "react";
import { Button, ErrorState, GlassPanel } from "../../../../../components/ui";

interface ConversationsErrorProps {
  error: unknown;
  retry: () => void;
}

/** The conversations list or a thread failed to load. The project header and tabs stay. */
export default function ConversationsError({ error, retry }: ConversationsErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <GlassPanel padding="none">
      <ErrorState
        title="Conversations didn't load"
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
