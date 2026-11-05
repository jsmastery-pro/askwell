// After checkout, the plan changes only when Clerk's webhook reaches us
// (§6.10). Until then the page re-checks the plan on the server every
// ACTIVATION_POLL_MS, for at most ACTIVATION_TIMEOUT_MS. Pure, so it's tested
// without timers or a DOM.
import type { Plan } from "@askwell/shared";

export const ACTIVATION_POLL_MS = 2000;
export const ACTIVATION_TIMEOUT_MS = 30_000;

/** The query the pricing table redirects to after a successful checkout. */
export const CHECKOUT_SUCCESS_PARAM = "checkout";
export const CHECKOUT_SUCCESS_VALUE = "success";
export const CHECKOUT_RETURN_URL = `/dashboard/billing?${CHECKOUT_SUCCESS_PARAM}=${CHECKOUT_SUCCESS_VALUE}`;

export type Activation = "none" | "activating" | "timed-out" | "activated";

/**
 * Where activation stands: not after a checkout → "none"; the server says Pro
 * → "activated"; still Free → "activating" until the timeout, then "timed-out".
 */
export function activationState(afterCheckout: boolean, plan: Plan, elapsedMs: number): Activation {
  if (!afterCheckout) return "none";
  if (plan === "pro") return "activated";
  return elapsedMs >= ACTIVATION_TIMEOUT_MS ? "timed-out" : "activating";
}

/** Keep polling the server? Only while activating. */
export const shouldPoll = (state: Activation) => state === "activating";

/**
 * Time since polling started, by the wall clock. Browsers delay timers in a
 * background tab, so counting ticks would let "Activating Pro…" run well past
 * the timeout; measuring real time stops it on time.
 */
export function elapsedSince(startedAtMs: number, nowMs: number): number {
  return Math.max(0, nowMs - startedAtMs);
}
