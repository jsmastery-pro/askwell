// Browser calls to the conversations list route (project.md §8). Each call
// resolves to the route's data or its §8 error; callers switch on `code`.
import type { ConversationSummary, ListConversationsResponse } from "@askwell/shared";
import { isObject, request, type ApiResult } from "../projects/api";

function isSummary(value: unknown): value is ConversationSummary {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.project_id === "string" &&
    typeof value.visitor_id === "string" &&
    typeof value.created_at === "string" &&
    (value.preview === null || typeof value.preview === "string") &&
    typeof value.message_count === "number"
  );
}

const isListResponse = (body: unknown): body is ListConversationsResponse =>
  isObject(body) &&
  Array.isArray(body.conversations) &&
  body.conversations.every(isSummary) &&
  (body.nextCursor === null || typeof body.nextCursor === "string");

/** One page, newest first: the first page, or the page older than `before` (a `nextCursor`). */
export function listConversations(projectId: string, before?: string): Promise<ApiResult<ListConversationsResponse>> {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  return request(
    `/api/projects/${encodeURIComponent(projectId)}/conversations${query}`,
    { method: "GET" },
    isListResponse,
  );
}
