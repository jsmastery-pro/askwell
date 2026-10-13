"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BUTTON_SECONDARY } from "../ui/styles";

// Manual refresh only: no realtime (project.md §6.7). Re-runs the page's server data.
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      aria-live="polite"
      className={BUTTON_SECONDARY}
    >
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
