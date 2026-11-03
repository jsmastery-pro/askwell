import type { Metadata } from "next";
import { Suspense } from "react";
import { APP_NAME } from "@askwell/shared";
import { PlanBadge, PlanBadgeSkeleton } from "../../components/dashboard/PlanBadge";
import { Sidebar } from "../../components/dashboard/Sidebar";

export const metadata: Metadata = {
  title: { template: `%s · ${APP_NAME}`, default: `Dashboard · ${APP_NAME}` },
  robots: { index: false, follow: false },
};

// The dashboard shell (§6, §13: light, monochrome, glass). The proxy sends
// signed-out requests to sign-in; PlanBadge checks auth again, creates the
// owner's account row on every load (idempotent) and shows their plan.
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div data-surface="light" className="relative isolate min-h-dvh md:flex">
      {/* Soft glows behind the glass so the blur is visible. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-24 right-0 -z-10 size-96 rounded-full bg-glow blur-glow"
      />
      <Sidebar
        plan={
          <Suspense fallback={<PlanBadgeSkeleton />}>
            <PlanBadge />
          </Suspense>
        }
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-10 md:py-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
