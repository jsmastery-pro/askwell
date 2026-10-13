"use client";

import { ErrorState } from "../../../../components/ui/ErrorState";

// Shown if the Overview or Install tab fails. The tabs above stay usable.
export default function ProjectError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="This project didn't load" reset={reset} />;
}
