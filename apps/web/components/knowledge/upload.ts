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
  | { ok: false; step: "check" | "reserve"; error: ApiFailure }
  /**
   * Failed after the reservation. `pendingSourceId` is set when a source row is
   * left behind: the Storage upload failed and deleting the reservation failed
   * too, or finalize failed (the claim may already have gone through, so it
   * can be retried with the same id, never deleted automatically).
   */
  | { ok: false; step: "upload" | "finalize"; error: ApiFailure; pendingSourceId: string | null };

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
 * doesn't hold a source slot until the 2-hour reclaim; if that delete fails
 * too, the result says so (pendingSourceId).
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
    const deleted = await deps.deleteSource(source.id);
    return { ok: false, step: "upload", error: put.error, pendingSourceId: deleted.ok ? null : source.id };
  }

  return finalizeKnowledgeFile(projectId, source.id, onStep, deps);
}

/** Step 3 alone: also the "Retry" after a finalize failure, with the same source id. */
export async function finalizeKnowledgeFile(
  projectId: string,
  sourceId: string,
  onStep: (step: UploadStep) => void = () => undefined,
  deps: Pick<UploadDeps, "finalizeUpload"> = defaultDeps,
): Promise<UploadResult> {
  onStep("finalize");
  const finalized: ApiResult<KnowledgeSource> = await deps.finalizeUpload(projectId, sourceId);
  return finalized.ok
    ? { ok: true, source: finalized.data }
    : { ok: false, step: "finalize", error: finalized.error, pendingSourceId: sourceId };
}
