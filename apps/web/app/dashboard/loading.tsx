import { Bone, LoadingState } from "../../components/ui/Skeleton";

// Shown while the dashboard's numbers load.
export default function DashboardLoading() {
  return (
    <LoadingState label="Loading dashboard">
      <div className="flex justify-between gap-4">
        <Bone className="h-9 w-48" />
        <Bone className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((card) => (
          <Bone key={card} className="h-28" />
        ))}
      </div>
      <Bone className="h-64" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Bone className="h-56" />
        <Bone className="h-56" />
      </div>
    </LoadingState>
  );
}
