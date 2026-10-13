"use client";

import { ErrorState } from "../../../../../components/ui/ErrorState";

// Shown if loading Knowledge fails. The tabs above stay usable.
export default function KnowledgeError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="Knowledge didn't load" reset={reset} />;
}
