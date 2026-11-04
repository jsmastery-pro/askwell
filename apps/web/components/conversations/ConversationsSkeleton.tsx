import { GlassPanel, Skeleton } from "../ui";

/** Placeholder with the same layout as ConversationsList. */
export function ConversationsSkeleton() {
  return (
    <div role="status" aria-label="Loading conversations" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-2">
          <Skeleton shape="text" className="h-6 w-36" />
          <Skeleton shape="text" className="w-64 max-w-full" />
        </div>
        <Skeleton className="h-8 w-20" />
      </div>
      <GlassPanel padding="none" className="flex flex-col divide-y divide-line">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2 px-5 py-4">
            <Skeleton shape="text" className="w-72 max-w-full" />
            <Skeleton shape="text" className="w-32" />
          </div>
        ))}
      </GlassPanel>
    </div>
  );
}

/** Placeholder for one thread. */
export function ThreadSkeleton() {
  return (
    <div role="status" aria-label="Loading conversation" className="flex flex-col gap-4">
      <Skeleton shape="text" className="w-40" />
      <GlassPanel className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className={i % 2 ? "flex flex-col items-end gap-2" : "flex flex-col gap-2"}>
            <Skeleton shape="text" className="w-16" />
            <Skeleton className="h-12 w-64 max-w-full" />
          </div>
        ))}
      </GlassPanel>
    </div>
  );
}
