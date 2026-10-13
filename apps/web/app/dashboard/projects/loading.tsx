import { Bone, LoadingState } from "../../../components/ui/Skeleton";

// Shown while the project list and usage load.
export default function ProjectsLoading() {
  return (
    <LoadingState label="Loading projects">
      <div className="space-y-3">
        <Bone className="h-9 w-44" />
        <Bone className="h-4 w-96 max-w-full" />
      </div>
      <Bone className="h-10 w-full" />
      <div className="space-y-3">
        {[0, 1, 2].map((row) => (
          <Bone key={row} className="h-20" />
        ))}
      </div>
    </LoadingState>
  );
}
