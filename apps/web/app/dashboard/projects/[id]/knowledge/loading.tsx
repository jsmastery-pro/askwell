import { Bone, LoadingState } from "../../../../../components/ui/Skeleton";

// Shown while the Knowledge tab's server data loads.
export default function KnowledgeLoading() {
  return (
    <LoadingState label="Loading knowledge">
      <div className="space-y-3">
        <Bone className="h-6 w-40" />
        <Bone className="h-4 w-80 max-w-full" />
      </div>
      <Bone className="h-2 w-full max-w-md" />
      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <Bone className="h-36" />
        <Bone className="h-36" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((row) => (
          <Bone key={row} className="h-14" />
        ))}
      </div>
    </LoadingState>
  );
}
