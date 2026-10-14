"use client";

import { BUTTON_SECONDARY } from "./styles";

/** The body of a route's error.tsx. The navbar and tabs around it stay usable. */
export function ErrorState({ title, reset }: { title: string; reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-line bg-surface px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">Check your connection, then try again.</p>
      <button type="button" onClick={reset} className={`mt-5 ${BUTTON_SECONDARY}`}>
        Try again
      </button>
    </div>
  );
}
