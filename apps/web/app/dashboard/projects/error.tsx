"use client";

import { ErrorState } from "../../../components/ui/ErrorState";

// Shown if the project list fails to load.
export default function ProjectsError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="Your projects didn't load" reset={reset} />;
}
