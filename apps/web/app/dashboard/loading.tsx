import { GlassPanel, Skeleton } from "../../components/ui";

/** Shown while a dashboard page loads. Same layout as the page. */
export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton shape="text" className="h-7 w-40" />
        <Skeleton shape="text" className="w-64 max-w-full" />
      </div>
      <GlassPanel className="flex flex-col items-center gap-4 py-12">
        <Skeleton shape="circle" className="size-12" />
        <Skeleton shape="text" className="w-36" />
        <Skeleton shape="text" className="w-72 max-w-full" />
        <Skeleton className="h-10 w-36" />
      </GlassPanel>
    </div>
  );
}
