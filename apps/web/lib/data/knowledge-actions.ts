import type { AddKnowledgeResponse, AddTextKnowledgeRequest, ApiError, DeleteKnowledgeResponse } from "@askwell/shared";

// Client-callable writes. No database imports, so client components can use them.

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data as ApiError | null)?.error?.message ?? "Request failed.");
  return data as T;
}

export async function addTextKnowledge(
  projectId: string,
  request: AddTextKnowledgeRequest,
): Promise<AddKnowledgeResponse> {
  return send(`/api/projects/${projectId}/knowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export async function addFileKnowledge(
  projectId: string,
  file: File,
  title?: string,
): Promise<AddKnowledgeResponse> {
  const form = new FormData();
  form.set("file", file);
  if (title) form.set("title", title);
  return send(`/api/projects/${projectId}/knowledge`, { method: "POST", body: form });
}

export async function deleteKnowledgeSource(sourceId: string): Promise<DeleteKnowledgeResponse> {
  return send(`/api/knowledge/${sourceId}`, { method: "DELETE" });
}
