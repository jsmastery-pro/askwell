"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
}

/**
 * Last-resort boundary: the root layout itself failed, so this replaces it
 * and needs its own <html> and <body>. Reports to PostHog Error tracking;
 * shows the user no error details.
 */
export default function GlobalError({ error }: GlobalErrorProps) {
  useEffect(() => {
    if (posthog.__loaded) posthog.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1rem", textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <p>Please reload the page.</p>
        </main>
      </body>
    </html>
  );
}
