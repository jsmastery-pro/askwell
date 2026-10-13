import { Bone, LoadingState } from "../../../../../components/ui/Skeleton";

// Shown while the conversation list or a thread loads.
export default function ConversationsLoading() {
  return (
    <LoadingState label="Loading conversations">
      <div className="space-y-3">
        <Bone className="h-6 w-40" />
        <Bone className="h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((row) => (
          <Bone key={row} className="h-14" />
        ))}
      </div>
    </LoadingState>
  );
}
