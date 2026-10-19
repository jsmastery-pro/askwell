"use client";

import { ErrorState } from "../../../../components/ui/ErrorState";
import { useCaptureException } from "../../../../components/ui/useCaptureException";

// Shown if the Overview or Install tab fails. The tabs above stay usable.
export default function ProjectError({ error, reset }: { error: Error; reset: () => void }) {
  useCaptureException(error);
  return <ErrorState title="This project didn't load" reset={reset} />;
}
