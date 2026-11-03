import { API_ERROR_STATUS, type ApiError } from "@askwell/shared";

/** The 401 an owner API route returns to a signed-out request (§8 error shape). */
export function unauthorizedResponse(message = "Sign in to use this route."): Response {
  const body: ApiError = { error: { code: "unauthorized", message } };
  return Response.json(body, { status: API_ERROR_STATUS.unauthorized });
}
