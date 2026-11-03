import type { Metadata } from "next";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { EmptyState, GlassPanel } from "../../../components/ui";

export const metadata: Metadata = { title: "Billing" };

// Placeholder so the nav link works. Clerk Billing fills it in a later phase.
export default function BillingPage() {
  return (
    <>
      <PageHeader title="Billing" />
      <GlassPanel padding="none">
        <EmptyState
          title="Billing arrives soon"
          description="You'll see your plan and upgrade to Pro here."
        />
      </GlassPanel>
    </>
  );
}
