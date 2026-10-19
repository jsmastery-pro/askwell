"use client";

import Link from "next/link";
import { ErrorState } from "../components/ui/ErrorState";
import { TEXT_LINK } from "../components/ui/styles";

// Shown if the landing or sign-in pages fail to render. The dashboard and /embed have their own.
export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-16">
      <div className="w-full max-w-md space-y-4 text-center">
        <ErrorState title="This page didn't load" reset={reset} />
        <Link href="/" className={TEXT_LINK}>
          Back to the home page
        </Link>
      </div>
    </main>
  );
}
