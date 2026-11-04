// Browser calls to the knowledge API (A3). Same contract as the projects
// client: every call resolves to the route's data or its §8 error.
import {
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  type CreateTextSourceBody,
  type CreateTextSourceResponse,
  type CreateUploadUrlBody,
  type CreateUploadUrlResponse,
  type DeletedResponse,
  type FinalizeUploadResponse,
  type KnowledgeSource,
} from "@askwell/shared";
import { isObject, request, type ApiResult } from "../projects/api";

/** The fields the knowledge UI reads from a KnowledgeSource. */
export function isKnowledgeSource(value: unknown): value is KnowledgeSource {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.created_at === "string" &&
    (KNOWLEDGE_SOURCE_TYPES as readonly unknown[]).includes(value.type) &&
    (KNOWLEDGE_SOURCE_STATUSES as readonly unknown[]).includes(value.status)
  );
}

const isSourceResponse = (body: unknown): body is CreateTextSourceResponse & FinalizeUploadResponse =>
  isObject(body) && isKnowledgeSource(body.source);

const isUploadUrlResponse = (body: unknown): body is CreateUploadUrlResponse =>
  isObject(body) &&
  isKnowledgeSource(body.source) &&
  isObject(body.upload) &&
  typeof body.upload.path === "string" &&
  typeof body.upload.token === "string";

const isDeletedResponse = (body: unknown): body is DeletedResponse =>
  isObject(body) && typeof body.id === "string";

const knowledgeUrl = (projectId: string, path = "") =>
  `/api/projects/${encodeURIComponent(projectId)}/knowledge${path}`;

export async function createTextSource(
  projectId: string,
  body: CreateTextSourceBody,
): Promise<ApiResult<KnowledgeSource>> {
  const result = await request(knowledgeUrl(projectId), { method: "POST", body: JSON.stringify(body) }, isSourceResponse);
  return result.ok ? { ok: true, data: result.data.source } : result;
}

export function createUploadUrl(
  projectId: string,
  body: CreateUploadUrlBody,
): Promise<ApiResult<CreateUploadUrlResponse>> {
  return request(
    knowledgeUrl(projectId, "/upload-url"),
    { method: "POST", body: JSON.stringify(body) },
    isUploadUrlResponse,
  );
}

export async function finalizeUpload(projectId: string, sourceId: string): Promise<ApiResult<KnowledgeSource>> {
  const result = await request(
    knowledgeUrl(projectId, "/finalize"),
    { method: "POST", body: JSON.stringify({ sourceId }) },
    isSourceResponse,
  );
  return result.ok ? { ok: true, data: result.data.source } : result;
}

export async function deleteSource(id: string): Promise<ApiResult<string>> {
  const result = await request(`/api/knowledge/${encodeURIComponent(id)}`, { method: "DELETE" }, isDeletedResponse);
  return result.ok ? { ok: true, data: result.data.id } : result;
}
