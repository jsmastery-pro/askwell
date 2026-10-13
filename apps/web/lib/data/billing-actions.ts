import type { CheckoutResponse, PortalResponse } from "@askwell/shared";
import { demoDelay } from "./demo";

// Client-callable writes. No database imports, so client components can use them.

// MOCK: replace with POST /api/billing/checkout (Phase 5).
export async function startCheckout(): Promise<CheckoutResponse> {
  await demoDelay();
  return { url: `${window.location.origin}/dashboard/billing?demo=checkout` };
}

// MOCK: replace with POST /api/billing/portal (Phase 5).
export async function openBillingPortal(): Promise<PortalResponse> {
  await demoDelay();
  return { url: `${window.location.origin}/dashboard/billing?demo=portal` };
}
