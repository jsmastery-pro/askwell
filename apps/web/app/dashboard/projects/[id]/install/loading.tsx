import { Bone, LoadingState } from "../../../../../components/ui/Skeleton";

// Shown while the install snippet loads.
export default function InstallLoading() {
  return (
    <LoadingState label="Loading install">
      <div className="space-y-3">
        <Bone className="h-6 w-40" />
        <Bone className="h-4 w-80 max-w-full" />
      </div>
      <Bone className="h-28 w-full max-w-3xl" />
    </LoadingState>
  );
}
