import { Bone, LoadingState } from "../../../components/ui/Skeleton";

// Shown while the plan and usage load.
export default function BillingLoading() {
  return (
    <LoadingState label="Loading billing">
      <Bone className="h-9 w-40" />
      <Bone className="h-44" />
      <Bone className="h-40" />
    </LoadingState>
  );
}
