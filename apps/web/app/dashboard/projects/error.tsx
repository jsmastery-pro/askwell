"use client";

import { ErrorState } from "../../../components/ui/ErrorState";
import { useCaptureException } from "../../../components/ui/useCaptureException";

// Shown if the project list fails to load.
export default function ProjectsError({ error, reset }: { error: Error; reset: () => void }) {
  useCaptureException(error);
  return <ErrorState title="Your projects didn't load" reset={reset} />;
}
