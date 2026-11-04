// The three-step file upload (§6.4): upload-url reserves the source and signs
// an upload, the browser puts the file in Storage, finalize claims and
// processes it. The steps are passed in so tests can run the flow without
// fetch or Storage.
import type { KnowledgeSource } from "@askwell/shared";
import type { ApiFailure, ApiResult } from "../projects/api";
import { createUploadUrl, deleteSource, finalizeUpload } from "./api";
import { checkFile } from "./files";
import { putSignedUpload } from "./storage";

export type UploadStep = "check" | "reserve" | "upload" | "finalize";

export type UploadResult =
  | { ok: true; source: KnowledgeSource }
  | { ok: false; step: UploadStep; error: ApiFailure };

export type UploadDeps = {
  createUploadUrl: typeof createUploadUrl;
  putSignedUpload: typeof putSignedUpload;
  finalizeUpload: typeof finalizeUpload;
  deleteSource: typeof deleteSource;
};

const defaultDeps: UploadDeps = { createUploadUrl, putSignedUpload, finalizeUpload, deleteSource };

/**
 * Uploads `file` as a new source of `projectId`. `onStep` reports progress
 * for the UI. When the Storage upload fails, the reservation is deleted so it
 * doesn't hold a source slot until the 2-hour reclaim.
 */
export async function uploadKnowledgeFile(
  projectId: string,
  file: File,
  onStep: (step: UploadStep) => void = () => undefined,
  deps: UploadDeps = defaultDeps,
): Promise<UploadResult> {
  onStep("check");
  const check = checkFile(file);
  if (!check.ok) return { ok: false, step: "check", error: { code: "validation_failed", message: check.message } };

  onStep("reserve");
  const reserved = await deps.createUploadUrl(projectId, {
    fileName: file.name,
    sizeBytes: file.size,
    mimeType: check.mimeType,
  });
  if (!reserved.ok) return { ok: false, step: "reserve", error: reserved.error };
  const { source, upload } = reserved.data;

  onStep("upload");
  const put = await deps.putSignedUpload(upload, file, check.mimeType);
  if (!put.ok) {
    await deps.deleteSource(source.id);
    return { ok: false, step: "upload", error: put.error };
  }

  onStep("finalize");
  const finalized: ApiResult<KnowledgeSource> = await deps.finalizeUpload(projectId, source.id);
  return finalized.ok ? { ok: true, source: finalized.data } : { ok: false, step: "finalize", error: finalized.error };
}
