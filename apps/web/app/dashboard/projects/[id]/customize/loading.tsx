import { Bone, LoadingState } from "../../../../../components/ui/Skeleton";

// Shown while the Customize tab's config and plan load.
export default function CustomizeLoading() {
  return (
    <LoadingState label="Loading customize">
      <div className="space-y-3">
        <Bone className="h-6 w-40" />
        <Bone className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-10 xl:grid-cols-2">
        <div className="space-y-5">
          {[0, 1, 2, 3, 4].map((row) => (
            <Bone key={row} className="h-12" />
          ))}
        </div>
        <Bone className="h-[620px]" />
      </div>
    </LoadingState>
  );
}
