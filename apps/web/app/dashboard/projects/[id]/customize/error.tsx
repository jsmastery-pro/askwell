"use client";

import { ErrorState } from "../../../../../components/ui/ErrorState";
import { useCaptureException } from "../../../../../components/ui/useCaptureException";

// Shown if loading Customize fails. The tabs above stay usable.
export default function CustomizeError({ error, reset }: { error: Error; reset: () => void }) {
  useCaptureException(error);
  return <ErrorState title="Widget settings didn't load" reset={reset} />;
}
