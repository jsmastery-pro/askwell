"use client";

import { useEffect } from "react";
import { Button, ErrorState, GlassPanel } from "../../../../components/ui";

interface ProjectSectionErrorProps {
  error: unknown;
  retry: () => void;
}

/**
 * A project page (Knowledge, Customize, Install) failed to load. Sits inside
 * the project layout, so the project's name and tabs stay and the owner can
 * switch sections. Conversations has its own.
 */
export default function ProjectSectionError({ error, retry }: ProjectSectionErrorProps) {
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
