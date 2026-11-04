import { GlassPanel, Skeleton } from "../ui";

/** Placeholder with the same layout as KnowledgeManager. */
export function KnowledgeSkeleton() {
  return (
    <div role="status" aria-label="Loading knowledge" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton shape="text" className="h-6 w-32" />
        <Skeleton shape="text" className="w-72 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <GlassPanel key={i} className="flex flex-col gap-3">
            <Skeleton shape="text" className="w-24" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-28" />
          </GlassPanel>
        ))}
      </div>
      <GlassPanel padding="none" className="flex flex-col divide-y divide-line">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex flex-col gap-2">
              <Skeleton shape="text" className="w-48 max-w-full" />
              <Skeleton shape="text" className="w-32" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </GlassPanel>
    </div>
  );
}
