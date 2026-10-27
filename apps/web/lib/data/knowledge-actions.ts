import type {
  AddKnowledgeResponse,
  AddTextKnowledgeRequest,
  ApiError,
  DeleteKnowledgeResponse,
  RequestKnowledgeUploadResponse,
} from "@askwell/shared";
import { uploadKnowledgeFileToSignedUrl } from "../storage/browser";

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

// SB-T06: straight to Storage with a signed URL, not through our server, so a file is no longer
// bounded by Vercel's function body limit. Reserve a source and get a one-time signed upload URL,
// PUT the file straight to Storage with it, then finalize (real size + PDF magic bytes, then
// processing starts).
export async function addFileKnowledge(
  projectId: string,
  file: File,
  title?: string,
): Promise<AddKnowledgeResponse> {
  const { source, path, token } = await send<RequestKnowledgeUploadResponse>(
    `/api/projects/${projectId}/knowledge/upload-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, size: file.size, title }),
    },
  );

  await uploadKnowledgeFileToSignedUrl(path, token, file);

  return send(`/api/projects/${projectId}/knowledge/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId: source.id }),
  });
}

export async function deleteKnowledgeSource(sourceId: string): Promise<DeleteKnowledgeResponse> {
  return send(`/api/knowledge/${sourceId}`, { method: "DELETE" });
}
