import { Bone, LoadingState } from "../../../../components/ui/Skeleton";

// Shown while a project's Overview loads.
export default function ProjectLoading() {
  return (
    <LoadingState label="Loading project">
      <Bone className="h-12 w-48" />
      <Bone className="h-2 w-full max-w-xl" />
      <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        <Bone className="h-48" />
        <Bone className="h-48" />
      </div>
    </LoadingState>
  );
}
