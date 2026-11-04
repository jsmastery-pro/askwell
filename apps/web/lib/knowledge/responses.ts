// Error responses the knowledge routes share (§8 shape).
import "server-only";
import { API_ERROR_STATUS } from "@askwell/shared";
import { jsonError } from "../api/errors";
import type { SourceLimitError } from "./sources";

/** 403 plan_limit_reached, with the upgrade hint on Free. */
export function sourceLimitResponse(error: SourceLimitError): Response {
  const upgrade = error.plan === "free" ? " Delete one, or upgrade to Pro for more." : " Delete one to add another.";
  return jsonError(API_ERROR_STATUS.plan_limit_reached, "plan_limit_reached", `${error.message}${upgrade}`);
}

/** 404 for a source that doesn't exist, isn't the caller's, or can't be finalized (any more). */
export function sourceNotFound(message = "Knowledge source not found."): Response {
  return jsonError(API_ERROR_STATUS.not_found, "not_found", message);
}

/** 400 validation_failed with a message for the owner. */
export function refused(message: string): Response {
  return jsonError(API_ERROR_STATUS.validation_failed, "validation_failed", message);
}
