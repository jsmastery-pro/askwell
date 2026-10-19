"use client";

import { ErrorState } from "../../../../../components/ui/ErrorState";
import { useCaptureException } from "../../../../../components/ui/useCaptureException";

// Shown if loading Knowledge fails. The tabs above stay usable.
export default function KnowledgeError({ error, reset }: { error: Error; reset: () => void }) {
  useCaptureException(error);
  return <ErrorState title="Knowledge didn't load" reset={reset} />;
}
