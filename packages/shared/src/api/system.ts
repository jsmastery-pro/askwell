// System routes (project.md §8).
import { z } from "zod";

// POST /api/clerk/webhook
// The signature is verified first (verifyWebhook). This schema covers only the
// fields the plan sync reads from Clerk Billing events; the rest pass through.
const clerkPlanSchema = z.looseObject({ slug: z.string() });
const clerkPayerSchema = z.looseObject({
  user_id: z.string().nullish(),
});

export const clerkWebhookBody = z.looseObject({
  type: z.string().min(1),
  data: z.looseObject({
    id: z.string().optional(),
    status: z.string().optional(),
    payer: clerkPayerSchema.nullish(),
    /** On subscription.* events. */
    items: z.array(z.looseObject({ plan: clerkPlanSchema.nullish() })).optional(),
    /** On subscriptionItem.* events (the data is the item). */
    plan: clerkPlanSchema.nullish(),
  }),
});
export type ClerkWebhookBody = z.infer<typeof clerkWebhookBody>;
export type ClerkWebhookResponse = { received: true };

// GET /api/posthog-config (no input). Public values, read at request time.
export type PosthogConfigResponse = {
  key: string;
  host: string;
};
