import type { ReactNode } from "react";

/** The body of a route's loading.tsx: named for screen readers, still when motion is reduced. */
export function LoadingState({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-label={label} className="space-y-6 motion-safe:animate-pulse">
      {children}
    </div>
  );
}

/** One grey placeholder block. Size it with classes, e.g. "h-6 w-40". */
export function Bone({ className }: { className: string }) {
  return <div className={`rounded-md bg-[#DDE2EA] ${className}`} />;
}
