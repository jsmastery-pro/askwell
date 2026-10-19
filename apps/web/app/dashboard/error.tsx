"use client";

import { ErrorState } from "../../components/ui/ErrorState";
import { useCaptureException } from "../../components/ui/useCaptureException";

// Shown if a dashboard page fails, including a project's header. The navbar stays usable.
export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  useCaptureException(error);
  return <ErrorState title="This page didn't load" reset={reset} />;
}
