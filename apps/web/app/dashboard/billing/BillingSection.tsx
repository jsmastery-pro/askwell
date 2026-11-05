import { BillingView } from "../../../components/billing/BillingView";
import { CHECKOUT_SUCCESS_PARAM, CHECKOUT_SUCCESS_VALUE } from "../../../components/billing/activation";
import { loadOwnPlan } from "../../../lib/accounts/account";

/**
 * Reads the owner's plan on the server (loadOwnPlan: owner client, RLS; it
 * awaits connection() first) and whether we're back from Clerk's checkout.
 * Render inside <Suspense>.
 */
export async function BillingSection({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [plan, query] = await Promise.all([loadOwnPlan(), searchParams]);
  const afterCheckout = query[CHECKOUT_SUCCESS_PARAM] === CHECKOUT_SUCCESS_VALUE;
  return <BillingView plan={plan} afterCheckout={afterCheckout} />;
}
