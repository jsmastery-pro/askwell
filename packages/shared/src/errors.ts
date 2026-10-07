import { z } from "zod";

// Known codes. `code` stays a plain string so new codes don't break clients.
export const ERROR_CODES = {
  unauthorized: "unauthorized",
  notFound: "not_found",
  invalidInput: "invalid_input",
  planLimit: "plan_limit",
  paymentRequired: "payment_required",
  rateLimited: "rate_limited",
  quotaExceeded: "quota_exceeded",
  internal: "internal",
} as const;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
