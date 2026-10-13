import type { ReactNode } from "react";

/** What a list shows when it has nothing in it yet: what's missing, and what to do about it. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[#CBD2DE] bg-white px-6 py-10 text-center">
      <p className="font-medium text-[#161A24]">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-sm text-[#70788D]">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
