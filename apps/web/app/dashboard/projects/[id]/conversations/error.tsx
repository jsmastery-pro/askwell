"use client";

import { ErrorState } from "../../../../../components/ui/ErrorState";
import { useCaptureException } from "../../../../../components/ui/useCaptureException";

// Shown if the conversation list or a thread fails. The tabs above stay usable.
export default function ConversationsError({ error, reset }: { error: Error; reset: () => void }) {
  useCaptureException(error);
  return <ErrorState title="Conversations didn't load" reset={reset} />;
}
