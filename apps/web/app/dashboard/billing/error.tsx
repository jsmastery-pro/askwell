"use client";

import { ErrorState } from "../../../components/ui/ErrorState";
import { useCaptureException } from "../../../components/ui/useCaptureException";

// Shown if loading Billing fails. The navbar stays usable.
export default function BillingError({ error, reset }: { error: Error; reset: () => void }) {
  useCaptureException(error);
  return <ErrorState title="Billing didn't load" reset={reset} />;
}
