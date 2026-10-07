import { z } from "zod";

// POST /api/billing/checkout and POST /api/billing/portal take no body; the server knows the account.
export const billingUrlResponseSchema = z.object({ url: z.url() });
export type BillingUrlResponse = z.infer<typeof billingUrlResponseSchema>;

export const checkoutResponseSchema = billingUrlResponseSchema;
export type CheckoutResponse = BillingUrlResponse;
export const portalResponseSchema = billingUrlResponseSchema;
export type PortalResponse = BillingUrlResponse;

// POST /api/stripe/webhook — raw Stripe body, verified by signature, not by zod.
export const stripeWebhookResponseSchema = z.object({ received: z.literal(true) });
export type StripeWebhookResponse = z.infer<typeof stripeWebhookResponseSchema>;
