import { ERROR_CODES, type ApiError } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";

// Owner routes are same-origin: no CORS headers.

export function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } } satisfies ApiError, { status });
}

export const unauthorized = () => errorResponse(ERROR_CODES.unauthorized, "Sign in required.", 401);
export const projectNotFound = () => errorResponse(ERROR_CODES.notFound, "Project not found.", 404);
export const invalidInput = (message: string) => errorResponse(ERROR_CODES.invalidInput, message, 400);

/** The signed-in Clerk user ID, or null. */
export async function getOwnerId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/** Parsed JSON body, or undefined if the body isn't valid JSON. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
