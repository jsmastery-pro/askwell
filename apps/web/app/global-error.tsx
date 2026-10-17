"use client";

import posthog from "posthog-js";
import { useEffect } from "react";
import "./globals.css";

// Render errors are caught by this boundary, so exception autocapture never sees them.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-canvas p-6 text-ink">
        <main className="max-w-sm text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted">This page didn&apos;t load. Try again in a moment.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-md bg-ink px-4 py-2 text-sm font-medium text-inverse hover:bg-ink/85"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
