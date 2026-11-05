import { GlassPanel, Skeleton } from "../ui";

/** Placeholder with the same layout as CustomizeForm. */
export function CustomizeSkeleton() {
  return (
    <div role="status" aria-label="Loading customization" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton shape="text" className="h-6 w-32" />
        <Skeleton shape="text" className="w-72 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassPanel className="flex flex-col gap-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton shape="text" className="w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-24" />
        </GlassPanel>
        <GlassPanel>
          <Skeleton className="h-[440px] w-full" />
        </GlassPanel>
      </div>
    </div>
  );
}
