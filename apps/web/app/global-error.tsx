"use client";

import { APP_NAME } from "@askwell/shared";
import posthog from "posthog-js";
import { useEffect } from "react";

// Render errors are caught by this boundary, so exception autocapture never sees them.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <p>Something went wrong in {APP_NAME}.</p>
        <a href="">Reload the page</a>
      </body>
    </html>
  );
}
