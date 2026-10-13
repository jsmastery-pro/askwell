"use client";

import { ErrorState } from "../../../../../components/ui/ErrorState";

// Shown if loading Customize fails. The tabs above stay usable.
export default function CustomizeError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="Widget settings didn't load" reset={reset} />;
}
