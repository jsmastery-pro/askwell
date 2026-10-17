import type { ApiError, UpdateWidgetConfigRequest, UpdateWidgetConfigResponse } from "@askwell/shared";

// Client-callable write. No database imports, so client components can use it.

export async function saveWidgetConfig(
  projectId: string,
  _current: UpdateWidgetConfigResponse["config"],
  changes: UpdateWidgetConfigRequest,
): Promise<UpdateWidgetConfigResponse> {
  const response = await fetch(`/api/projects/${projectId}/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data as ApiError | null)?.error?.message ?? "Request failed.");
  return data as UpdateWidgetConfigResponse;
}
