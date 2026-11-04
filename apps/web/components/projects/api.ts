// Browser calls to the projects API (A3). Every call resolves to either the
// route's data or its §8 error ({ code, message }); callers switch on `code`,
// never on the HTTP status.
import type {
  ApiError,
  CreateProjectResponse,
  DeletedResponse,
  Project,
  UpdateProjectResponse,
} from "@askwell/shared";

export type ApiFailure = ApiError["error"];
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

const NETWORK_ERROR: ApiFailure = {
  code: "internal",
  message: "Couldn't reach the server. Check your connection and try again.",
};

/** A response we can't use: not JSON, or not the shape the route promises. */
const BAD_RESPONSE: ApiFailure = { code: "internal", message: "Something went wrong. Try again." };

function isApiError(body: unknown): body is ApiError {
  if (typeof body !== "object" || body === null || !("error" in body)) return false;
  const error = (body as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

/**
 * Calls a route and checks its success body with `isValid`. An unparseable or
 * unexpected success body (e.g. an HTML page from a proxy) is an error, never
 * `ok: true`, so callers can always read the data they were promised.
 */
export async function request<T>(
  url: string,
  init: RequestInit,
  isValid: (body: unknown) => body is T,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) return isValid(body) ? { ok: true, data: body } : { ok: false, error: BAD_RESPONSE };
  if (isApiError(body)) return { ok: false, error: body.error };
  return { ok: false, error: BAD_RESPONSE };
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The fields the projects UI reads from a Project. */
function isProject(value: unknown): value is Project {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.public_key === "string" &&
    typeof value.created_at === "string"
  );
}

const isProjectResponse = (body: unknown): body is CreateProjectResponse & UpdateProjectResponse =>
  isObject(body) && isProject(body.project);

const isDeletedResponse = (body: unknown): body is DeletedResponse =>
  isObject(body) && typeof body.id === "string";

export async function createProject(name: string): Promise<ApiResult<Project>> {
  const result = await request(
    "/api/projects",
    { method: "POST", body: JSON.stringify({ name }) },
    isProjectResponse,
  );
  return result.ok ? { ok: true, data: result.data.project } : result;
}

export async function renameProject(id: string, name: string): Promise<ApiResult<Project>> {
  const result = await request(
    `/api/projects/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
    isProjectResponse,
  );
  return result.ok ? { ok: true, data: result.data.project } : result;
}

export async function deleteProject(id: string): Promise<ApiResult<string>> {
  const result = await request(
    `/api/projects/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    isDeletedResponse,
  );
  return result.ok ? { ok: true, data: result.data.id } : result;
}
