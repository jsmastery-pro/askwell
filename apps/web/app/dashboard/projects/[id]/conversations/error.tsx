"use client";

import { ErrorState } from "../../../../../components/ui/ErrorState";

// Shown if the conversation list or a thread fails. The tabs above stay usable.
export default function ConversationsError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="Conversations didn't load" reset={reset} />;
}
