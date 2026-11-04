// Knowledge sources for the knowledge routes (project.md §6.4, §7, §9):
// reserve and claim through the Postgres functions, the private "knowledge"
// bucket, and the checks an uploaded file must pass at finalize.
//
// Service client calls happen only after the route has checked the owner owns
// the project (getOwnedProject), and every one is scoped to that project id
// (§9 "Tenant leak"). Owner reads (getOwnedSource) use the owner client.
import "server-only";
import {
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  MAX_KNOWLEDGE_FILE_BYTES,
  PLAN_LIMITS,
  type AllowedFileExtension,
  type KnowledgeSource,
  type Plan,
} from "@askwell/shared";
import { createOwnerClient } from "../supabase/owner";
import { createServiceClient } from "../supabase/service";
import { chunkText } from "./chunk";

export const KNOWLEDGE_BUCKET = "knowledge";

/**
 * Most chunks one source may have. ~2,000 chunks of CHUNK_SIZE is ~2.6M
 * characters (a long book), which embeds in ~20 requests and inserts in ~40
 * batches: well inside finalize's maxDuration. Text past this is refused
 * with a clear message instead of timing out half-processed.
 */
export const MAX_CHUNKS_PER_SOURCE = 2000;

/** A Supabase call failed; `cause` is the supabase-js error. */
export class KnowledgeStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "KnowledgeStoreError";
  }
}

/** The project is at its plan's source limit. */
export class SourceLimitError extends Error {
  readonly plan: Plan;
  readonly limit: number;

  constructor(plan: Plan, limit: number) {
    super(`Your ${plan === "free" ? "Free" : "Pro"} plan allows ${limit} knowledge sources per project.`);
    this.name = "SourceLimitError";
    this.plan = plan;
    this.limit = limit;
  }
}

type SourceRow = Omit<KnowledgeSource, "type" | "status"> & { type: string; status: string };

/** Narrows the text columns (check constraints in the database) to the shared enums. */
export function toKnowledgeSource(row: SourceRow): KnowledgeSource {
  const type = KNOWLEDGE_SOURCE_TYPES.find((t) => t === row.type);
  const status = KNOWLEDGE_SOURCE_STATUSES.find((s) => s === row.status);
  if (!type || !status) throw new KnowledgeStoreError(`Unknown source type or status: ${row.type} / ${row.status}.`);
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    type,
    storage_key: row.storage_key,
    status,
    created_at: row.created_at,
  };
}

/** `<projectId>/<uuid>.<ext>`: unguessable, and always under the project's own prefix. */
export function newStorageKey(projectId: string, ext: AllowedFileExtension): string {
  return `${projectId}/${crypto.randomUUID()}.${ext}`;
}

export type ReserveInput =
  | { projectId: string; title: string; kind: "text"; plan: Plan }
  | { projectId: string; title: string; kind: "file"; ext: AllowedFileExtension; storageKey: string; plan: Plan };

/**
 * reserve_knowledge_source() with the limit of the plan the route read
 * (§5). Pasted text starts "processing"; a file starts "uploading". Returns
 * the new source and the storage keys of reservations it reclaimed (their
 * files should be deleted). Throws SourceLimitError at the limit.
 */
export async function reserveSource(
  input: ReserveInput,
): Promise<{ source: KnowledgeSource; reclaimedKeys: string[] }> {
  const limit = PLAN_LIMITS[input.plan].knowledgeSources;
  const service = createServiceClient();
  const { data, error } = await service
    .rpc("reserve_knowledge_source", {
      p_project_id: input.projectId,
      p_title: input.title,
      p_type: input.kind === "text" ? "text" : input.ext,
      p_storage_key: input.kind === "text" ? null : input.storageKey,
      p_status: input.kind === "text" ? "processing" : "uploading",
      p_max_sources: limit,
    })
    .single();

  if (error) {
    const { code, message } = error as { code?: string; message?: string };
    if (code === "P0001" && message === "plan_limit_reached") throw new SourceLimitError(input.plan, limit);
    throw new KnowledgeStoreError("Couldn't reserve the knowledge source.", { cause: error });
  }
  const { reclaimed_storage_keys, ...row } = data;
  return { source: toKnowledgeSource(row), reclaimedKeys: reclaimed_storage_keys };
}

/** claim_knowledge_source(): the source moved "uploading" → "processing", or null (unknown, other project, or claimed already). */
export async function claimSource(sourceId: string, projectId: string): Promise<KnowledgeSource | null> {
  const { data, error } = await createServiceClient()
    .rpc("claim_knowledge_source", { p_source_id: sourceId, p_project_id: projectId })
    .maybeSingle();
  if (error) throw new KnowledgeStoreError("Couldn't claim the knowledge source.", { cause: error });
  return data ? toKnowledgeSource(data) : null;
}

const SOURCE_COLUMNS = "id, project_id, title, type, storage_key, status, created_at";

/** The source as it is now (e.g. after processing), read with the service client in its project. */
export async function readSource(sourceId: string, projectId: string): Promise<KnowledgeSource> {
  const { data, error } = await createServiceClient()
    .from("knowledge_sources")
    .select(SOURCE_COLUMNS)
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .single();
  if (error) throw new KnowledgeStoreError("Couldn't read the knowledge source.", { cause: error });
  return toKnowledgeSource(data);
}

/** The caller's source with this id (owner client: RLS hides other owners' sources), or null. */
export async function getOwnedSource(sourceId: string): Promise<KnowledgeSource | null> {
  const owner = await createOwnerClient();
  const { data, error } = await owner.from("knowledge_sources").select(SOURCE_COLUMNS).eq("id", sourceId).maybeSingle();
  if (error) throw new KnowledgeStoreError("Couldn't read the knowledge source.", { cause: error });
  return data ? toKnowledgeSource(data) : null;
}

/** Deletes the source row in its project (its chunks go with it, on delete cascade). */
export async function deleteSourceRow(sourceId: string, projectId: string): Promise<void> {
  const { error } = await createServiceClient()
    .from("knowledge_sources")
    .delete()
    .eq("id", sourceId)
    .eq("project_id", projectId);
  if (error) throw new KnowledgeStoreError("Couldn't delete the knowledge source.", { cause: error });
}

/**
 * Marks the source "failed" in its project, for a route that hit an
 * unexpected error after claiming it (a claimed source is never reclaimed,
 * so it would otherwise stay "processing"). Best effort: a failure is logged,
 * not thrown, so the caller can rethrow the original error.
 */
export async function markSourceFailed(sourceId: string, projectId: string): Promise<void> {
  try {
    const { error } = await createServiceClient()
      .from("knowledge_sources")
      .update({ status: "failed" })
      .eq("id", sourceId)
      .eq("project_id", projectId);
    if (error) console.error(`[knowledge] marking source ${sourceId} failed didn't work`, error);
  } catch (error) {
    console.error(`[knowledge] marking source ${sourceId} failed didn't work`, error);
  }
}

/** A one-time signed upload for `storageKey` in the knowledge bucket. */
export async function createSignedUpload(
  storageKey: string,
): Promise<{ path: string; token: string; signedUrl: string }> {
  const { data, error } = await createServiceClient().storage.from(KNOWLEDGE_BUCKET).createSignedUploadUrl(storageKey);
  if (error) throw new KnowledgeStoreError("Couldn't sign the upload.", { cause: error });
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

/**
 * Storage's "no such object": HTTP 404, or (older Storage API versions) HTTP
 * 400 with statusCode "404" in the body; NoSuchKey is the newer error code.
 */
export function isMissingObject(error: unknown): boolean {
  const { status, statusCode, code } = error as { status?: number; statusCode?: string; code?: string };
  return status === 404 || statusCode === "404" || code === "NoSuchKey";
}

/** The uploaded file's bytes, or null if there is no object at `storageKey`. */
export async function downloadFile(storageKey: string): Promise<Uint8Array | null> {
  const { data, error } = await createServiceClient().storage.from(KNOWLEDGE_BUCKET).download(storageKey);
  if (error) {
    if (isMissingObject(error)) return null;
    throw new KnowledgeStoreError("Couldn't download the uploaded file.", { cause: error });
  }
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Deletes these files from the knowledge bucket. Best effort: a failure is
 * logged, not thrown, so the caller's answer doesn't depend on cleanup. A
 * missing object is not an error.
 */
export async function deleteFiles(storageKeys: (string | null)[]): Promise<void> {
  const keys = storageKeys.filter((key): key is string => Boolean(key));
  if (keys.length === 0) return;
  try {
    const { error } = await createServiceClient().storage.from(KNOWLEDGE_BUCKET).remove(keys);
    if (error) console.error("[knowledge] deleting files failed", keys, error);
  } catch (error) {
    console.error("[knowledge] deleting files failed", keys, error);
  }
}

/** Why an uploaded file was refused at finalize, in words for the owner. */
export type FileRefusal = string;

/**
 * The real-file checks at finalize (§9 "File upload"): not empty, at most
 * MAX_KNOWLEDGE_FILE_BYTES, and a PDF must start with the "%PDF-" bytes.
 * Returns null when the file passes.
 */
export function checkUploadedFile(bytes: Uint8Array, type: AllowedFileExtension): FileRefusal | null {
  if (bytes.byteLength === 0) return "The uploaded file is empty.";
  if (bytes.byteLength > MAX_KNOWLEDGE_FILE_BYTES) return "The uploaded file is over 10 MB.";
  if (type === "pdf" && !startsWithPdfMagic(bytes)) return "That file isn't a PDF.";
  return null;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function startsWithPdfMagic(bytes: Uint8Array): boolean {
  return PDF_MAGIC.every((byte, i) => bytes[i] === byte);
}

/** Null when `text` fits MAX_CHUNKS_PER_SOURCE, else the refusal. */
export function checkTextSize(text: string): FileRefusal | null {
  return chunkText(text).length > MAX_CHUNKS_PER_SOURCE
    ? "This file has too much text to process. Split it into smaller files."
    : null;
}
