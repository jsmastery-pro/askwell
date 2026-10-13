"use client";

import { ErrorState } from "../../../components/ui/ErrorState";

// Shown if loading Billing fails. The navbar stays usable.
export default function BillingError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="Billing didn't load" reset={reset} />;
}
