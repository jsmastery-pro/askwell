// Owner routes (project.md §8 "Owner"): a Clerk session is required, and the
// proxy already answers 401 to signed-out requests. Each handler checks again
// here, because the proxy matches URL paths only.
//
// No CORS on owner routes: they're same-origin only (§9 "CORS"). Never use
// lib/api/cors here.
import "server-only";
import { auth } from "@clerk/nextjs/server";
import { API_ERROR_STATUS } from "@askwell/shared";
import { unauthorizedResponse } from "../auth/responses";
import { UnauthorizedError } from "../supabase/owner";
import { jsonError } from "./errors";

/** The signed-in owner's Clerk user ID. Throws UnauthorizedError without a session. */
export async function requireOwnerId(): Promise<string> {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) throw new UnauthorizedError();
  return userId;
}

/**
 * Turns an error a handler didn't handle into a response: no session → 401;
 * anything else → 500 `internal`, logged on the server, with nothing about
 * the cause in the body.
 */
export function ownerRouteError(route: string, error: unknown): Response {
  if (error instanceof UnauthorizedError) return unauthorizedResponse();
  console.error(`${route} failed`, error);
  return jsonError(API_ERROR_STATUS.internal, "internal", "Something went wrong. Try again.");
}

/** 404 `not_found` for a project that doesn't exist or isn't the caller's: never 403 (§9). */
export function projectNotFound(): Response {
  return jsonError(API_ERROR_STATUS.not_found, "not_found", "Project not found.");
}
