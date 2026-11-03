// The error response every route sends (project.md §8): { error: { code, message } }.
import type { ApiError, ApiErrorCode } from "@askwell/shared";

/** A JSON error response in the §8 shape. Extra headers (e.g. CORS) go in `init`. */
export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  init?: ResponseInit,
): Response {
  const body: ApiError = { error: { code, message } };
  return Response.json(body, { ...init, status });
}
