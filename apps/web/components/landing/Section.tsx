import type { ReactNode } from "react";

export function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1180px] px-6 ${className}`}>{children}</div>;
}
