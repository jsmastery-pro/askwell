import { ERROR_CODES } from "@askwell/shared";

/**
 * Why a reply failed, as an `ERROR_CODES` value from the chat route's `{ error: { code } }`.
 * The panel picks its message from the code; it never shows the route's own error text.
 */
export class ReplyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ReplyError";
  }
}

export type ReplyFailure = "rate_limited" | "quota_exceeded" | "other";

/** Maps any thrown value to the state the panel shows. Unknown codes and network errors are "other". */
export function replyFailure(error: unknown): ReplyFailure {
  if (!(error instanceof ReplyError)) return "other";
  if (error.code === ERROR_CODES.rateLimited) return "rate_limited";
  if (error.code === ERROR_CODES.quotaExceeded) return "quota_exceeded";
  return "other";
}
