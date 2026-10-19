import { Bone, LoadingState } from "../../../../components/ui/Skeleton";

// Shown while a project's Overview loads.
export default function ProjectLoading() {
  return (
    <LoadingState label="Loading project">
      <Bone className="h-12 w-48" />
      <Bone className="h-2 w-full max-w-xl" />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Bone className="h-48" />
        <Bone className="h-48" />
      </div>
    </LoadingState>
  );
}
