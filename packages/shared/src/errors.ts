// The error shape every route returns: { error: { code, message } }.

export const API_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_failed",
  "plan_limit_reached",
  "payment_required",
  "rate_limited",
  "message_blocked",
  "quota_exceeded",
  "invalid_signature",
  "internal",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** The HTTP status each error code is sent with. */
export const API_ERROR_STATUS = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 400,
  plan_limit_reached: 403,
  payment_required: 402,
  rate_limited: 429,
  message_blocked: 403,
  quota_exceeded: 429,
  invalid_signature: 400,
  internal: 500,
} as const satisfies Record<ApiErrorCode, number>;

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
  };
};
