// Input validation for route handlers: every route parses its input with the
// zod schema from packages/shared and answers 400 `validation_failed` (§8).
import { API_ERROR_STATUS } from "@askwell/shared";
import { jsonError } from "./errors";

/**
 * What these helpers need from a schema: zod's `safeParse`. Typed structurally
 * so apps/web doesn't need its own zod dependency; the schemas themselves
 * come from packages/shared.
 */
export interface SafeParser<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] } };
}

export type ParseResult<T> = { success: true; data: T } | { success: false; response: Response };

function validationFailed(message: string): { success: false; response: Response } {
  return {
    success: false,
    response: jsonError(API_ERROR_STATUS.validation_failed, "validation_failed", message),
  };
}

/** Parses `input` with `schema`, or returns a 400 `validation_failed` response. */
export function parseInput<T>(schema: SafeParser<T>, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  if (result.success) return { success: true, data: result.data };

  // A short, user-safe summary of the first problem, e.g. "key: Invalid public key".
  const issue = result.error.issues[0];
  const path = issue?.path.map(String).join(".") ?? "";
  const message = issue?.message ?? "Invalid input.";
  return validationFailed(path ? `${path}: ${message}` : message);
}

/**
 * Parses a query string with `schema`. Each parameter must appear once: a
 * repeated parameter is a 400, so `?key=a&key=b` can't slip past a schema
 * that expects one string.
 */
export function parseQuery<T>(schema: SafeParser<T>, searchParams: URLSearchParams): ParseResult<T> {
  const query: Record<string, string> = {};
  for (const [name, value] of searchParams) {
    if (Object.hasOwn(query, name)) return validationFailed(`${name}: Send this parameter once.`);
    query[name] = value;
  }
  return parseInput(schema, query);
}
