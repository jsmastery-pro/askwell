"use client";

import { ErrorState } from "../../components/ui/ErrorState";

// Shown if a dashboard page fails, including a project's header. The navbar stays usable.
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="This page didn't load" reset={reset} />;
}
