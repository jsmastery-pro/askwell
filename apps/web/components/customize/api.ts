// The browser call to PATCH /api/projects/:id/config (project.md §8). Types
// come from packages/shared; the route is reached over HTTP only.
import type { UpdateWidgetConfigBody, UpdateWidgetConfigResponse, WidgetConfig } from "@askwell/shared";
import { isObject, request, type ApiResult } from "../projects/api";

const isConfigResponse = (body: unknown): body is UpdateWidgetConfigResponse =>
  isObject(body) &&
  isObject(body.config) &&
  typeof body.config.button_color === "string" &&
  typeof body.config.position === "string" &&
  typeof body.config.label === "string" &&
  typeof body.config.animation === "string" &&
  typeof body.config.header_text === "string" &&
  typeof body.config.show_badge === "boolean";

/** Saves `changes`. Resolves to the stored config, or the route's error (402 `payment_required` for Free). */
export async function saveWidgetConfig(
  projectId: string,
  changes: UpdateWidgetConfigBody,
): Promise<ApiResult<WidgetConfig>> {
  const result = await request(
    `/api/projects/${encodeURIComponent(projectId)}/config`,
    { method: "PATCH", body: JSON.stringify(changes) },
    isConfigResponse,
  );
  return result.ok ? { ok: true, data: result.data.config } : result;
}
