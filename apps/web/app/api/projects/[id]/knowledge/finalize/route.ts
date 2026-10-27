import {
  ERROR_CODES,
  MAX_KNOWLEDGE_FILE_BYTES,
  finalizeKnowledgeUploadRequestSchema,
  type AddKnowledgeResponse,
  type KnowledgeSource,
} from "@askwell/shared";
import type { Enums, Tables } from "@askwell/db/types";
import { createServiceClient } from "../../../../../../lib/supabase/service";
import { toKnowledgeSource } from "../../../../../../lib/data/knowledge";
import { runAfterResponse } from "../../../../../../lib/knowledge/background";
import { extractFileText, hasPdfMagicBytes } from "../../../../../../lib/knowledge/extract";
import { deleteKnowledgeSource, processKnowledgeSource } from "../../../../../../lib/knowledge";
import { captureServerEvent } from "../../../../../../lib/posthog/server";
import { getOwnedProject } from "../../../../../../lib/projects";
import { errorResponse, getOwnerId, invalidInput, projectNotFound, readJson, unauthorized } from "../../../../../../lib/projects/http";
import { deleteKnowledgeFile, readKnowledgeFile } from "../../../../../../lib/storage";

export const dynamic = "force-dynamic";
// Covers the request plus its after() ingest (extract, chunk, embed), same allowance as the text route.
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };
type ServiceClient = ReturnType<typeof createServiceClient>;

const MAX_FILE_MB = MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024);
const uploadNotFound = () => errorResponse(ERROR_CODES.notFound, "Upload not found.", 404);
const alreadyFinalized = () => invalidInput("This upload was already finalized.");

type ClaimedRow = Pick<Tables<"knowledge_sources">, "id" | "title" | "type" | "storage_key" | "status" | "created_at">;

const UPLOADING: Enums<"source_status"> = "uploading";

type ClaimResult =
  | { outcome: "claimed"; row: ClaimedRow }
  | { outcome: "not_found" }
  | { outcome: "already_finalized" };

/**
 * Finalize can only run once per upload: it atomically moves the row from `uploading` to
 * `processing` in one UPDATE, so two concurrent (or retried) finalize calls can't both pass —
 * only the one that actually flips the status gets a row back, and the other sees none. Without
 * this, a second call on a still-`processing` row would re-embed the file on our OpenAI key.
 */
async function claimForFinalize(service: ServiceClient, sourceId: string, projectId: string): Promise<ClaimResult> {
  const { data: claimed, error } = await service
    .from("knowledge_sources")
    .update({ status: "processing" })
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .eq("status", UPLOADING)
    .select("id, title, type, storage_key, status, created_at")
    .maybeSingle();
  if (error) throw error;
  if (claimed) return { outcome: "claimed", row: claimed };

  // No row was flipped: find out why, scoped to this project so we never confirm another
  // tenant's source id. Pasted text is never `uploading`, so it lands here too (same 404 as
  // before, since there's no file to finalize).
  const { data: existing } = await service
    .from("knowledge_sources")
    .select("type")
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!existing || existing.type === "text") return { outcome: "not_found" };
  return { outcome: "already_finalized" };
}

async function refuse(sourceId: string, storageKey: string, message: string, status: number) {
  // The row goes first, same order as a real delete (P3-T03 notes): if this throws, the source
  // and object are both untouched and finalize can be retried.
  await deleteKnowledgeSource(sourceId);
  try {
    await deleteKnowledgeFile(storageKey);
  } catch (error) {
    console.error(`Could not remove the rejected object for source ${sourceId}`, error);
  }
  return errorResponse(ERROR_CODES.invalidInput, message, status);
}

export async function POST(request: Request, { params }: Context) {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const { id: projectId } = await params;
  if (!(await getOwnedProject(projectId))) return projectNotFound();

  const parsed = finalizeKnowledgeUploadRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput("A source id is required.");

  const service = createServiceClient();
  const result = await claimForFinalize(service, parsed.data.sourceId, projectId);
  if (result.outcome === "not_found") return uploadNotFound();
  if (result.outcome === "already_finalized") return alreadyFinalized();
  const { row } = result;
  const type = row.type as Exclude<KnowledgeSource["type"], "text">;
  // Only a file upload is ever claimed from `uploading`; pasted text never has a storage key.
  const storageKey = row.storage_key!;

  let buffer: Buffer;
  try {
    buffer = await readKnowledgeFile(storageKey);
  } catch (error) {
    console.error(`Could not read the uploaded object for source ${row.id}`, error);
    // Nothing was read, so ingest never started — no double-billing risk here. Hand the
    // `uploading` state back (best effort) so a genuine retry can still claim it, instead of
    // leaving it stuck `processing` with no way back in.
    await service.from("knowledge_sources").update({ status: UPLOADING }).eq("id", row.id).eq("status", "processing");
    return errorResponse(ERROR_CODES.invalidInput, "The upload didn't complete. Try again.", 400);
  }

  if (buffer.byteLength === 0) return refuse(row.id, storageKey, "The upload didn't complete. Try again.", 400);
  if (buffer.byteLength > MAX_KNOWLEDGE_FILE_BYTES) {
    return refuse(row.id, storageKey, `The file is too large. Max ${MAX_FILE_MB} MB.`, 413);
  }
  if (type === "pdf" && !hasPdfMagicBytes(buffer)) {
    return refuse(row.id, storageKey, "The file is not a valid PDF.", 400);
  }

  captureServerEvent(ownerId, "knowledge_added", { project_id: projectId, type });
  runAfterResponse(() => processKnowledgeSource(row.id, projectId, () => extractFileText(type, buffer)));
  return Response.json({ source: toKnowledgeSource(row) } satisfies AddKnowledgeResponse, { status: 201 });
}
