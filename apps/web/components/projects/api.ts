// Browser calls to the projects API (A3). Every call resolves to either the
// route's data or its §8 error ({ code, message }); callers switch on `code`,
// never on the HTTP status.
import type {
  ApiError,
  ApiErrorCode,
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

async function request<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return { ok: true, data: body as T };
  if (isApiError(body)) return { ok: false, error: body.error };
  return {
    ok: false,
    error: { code: "internal" satisfies ApiErrorCode, message: "Something went wrong. Try again." },
  };
}

export async function createProject(name: string): Promise<ApiResult<Project>> {
  const result = await request<CreateProjectResponse>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return result.ok ? { ok: true, data: result.data.project } : result;
}

export async function renameProject(id: string, name: string): Promise<ApiResult<Project>> {
  const result = await request<UpdateProjectResponse>(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return result.ok ? { ok: true, data: result.data.project } : result;
}

export async function deleteProject(id: string): Promise<ApiResult<string>> {
  const result = await request<DeletedResponse>(`/api/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return result.ok ? { ok: true, data: result.data.id } : result;
}
