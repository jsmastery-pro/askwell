import type { Metadata } from "next";
import { Suspense } from "react";
import { BillingSkeleton } from "../../../components/billing/BillingView";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { BillingSection } from "./BillingSection";

export const metadata: Metadata = { title: "Billing" };

// The owner's plan and upgrades (§5, §6.10). The plan is read on the server
// inside <Suspense> (it reads the session); Clerk's pricing table and account
// portal handle checkout and changes, and the Clerk webhook updates the plan.
export default function BillingPage({ searchParams }: PageProps<"/dashboard/billing">) {
  return (
    <>
      <PageHeader title="Billing" description="Your plan, and upgrading to Pro." />
      <Suspense fallback={<BillingSkeleton />}>
        <BillingSection searchParams={searchParams} />
      </Suspense>
    </>
  );
}
