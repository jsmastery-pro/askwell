import {
  ERROR_CODES,
  KNOWLEDGE_FILE_TYPES,
  MAX_KNOWLEDGE_FILE_BYTES,
  PLAN_LIMITS,
  requestKnowledgeUploadRequestSchema,
  type RequestKnowledgeUploadResponse,
} from "@askwell/shared";
import type { Enums } from "@askwell/db/types";
import { createServiceClient } from "../../../../../../lib/supabase/service";
import { toKnowledgeSource } from "../../../../../../lib/data/knowledge";
import { getAccountPlan } from "../../../../../../lib/data/billing";
import { randomUUID } from "node:crypto";
import { getOwnedProject } from "../../../../../../lib/projects";
import { errorResponse, getOwnerId, invalidInput, projectNotFound, readJson, unauthorized } from "../../../../../../lib/projects/http";
import { createKnowledgeUploadUrl, deleteKnowledgeFile, knowledgeFileKey } from "../../../../../../lib/storage";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
type ServiceClient = ReturnType<typeof createServiceClient>;

const MAX_FILE_MB = MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024);

// A signed upload URL is valid for 2 hours (Supabase's fixed default; it isn't configurable), so a
// reservation this old is unreachable either way — the browser's upload can no longer land. Reclaim
// it here, lazily, before counting against the plan's source limit, rather than running a cron for
// something that only needs to happen right before the next reservation.
//
// Only `uploading` rows qualify: once finalize claims one it becomes `processing`, meaning ingest
// is actually running, not abandoned — reclaiming that would delete a source mid-ingest.
const ABANDONED_AFTER_MS = 2 * 60 * 60 * 1000;

const UPLOADING: Enums<"source_status"> = "uploading";

async function reclaimAbandoned(service: ServiceClient, projectId: string): Promise<void> {
  const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS).toISOString();
  const { data: stale, error } = await service
    .from("knowledge_sources")
    .select("id, storage_key")
    .eq("project_id", projectId)
    .eq("status", UPLOADING)
    .lt("created_at", cutoff);
  if (error) {
    console.error(`Could not look up abandoned reservations for project ${projectId}`, error);
    return;
  }

  for (const row of stale ?? []) {
    // Scoped to `uploading` too: if finalize claimed this row between the select above and here,
    // it's `processing` now and this delete matches nothing, instead of deleting it mid-ingest.
    const { error: deleteError, count } = await service
      .from("knowledge_sources")
      .delete({ count: "exact" })
      .eq("id", row.id)
      .eq("status", UPLOADING);
    if (deleteError) {
      console.error(`Could not remove the abandoned reservation ${row.id}`, deleteError);
      continue;
    }
    if (!count || row.storage_key === null) continue;
    try {
      await deleteKnowledgeFile(row.storage_key);
    } catch (cleanupError) {
      console.error(`Couldn't remove the abandoned object for source ${row.id}`, cleanupError);
    }
  }
}

function extensionType(fileName: string): (typeof KNOWLEDGE_FILE_TYPES)[keyof typeof KNOWLEDGE_FILE_TYPES] | null {
  const dot = fileName.lastIndexOf(".");
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  return KNOWLEDGE_FILE_TYPES[extension as keyof typeof KNOWLEDGE_FILE_TYPES] ?? null;
}

function sourceLimitReached(limit: number) {
  return errorResponse(
    ERROR_CODES.planLimit,
    `Your plan allows ${limit} knowledge source${limit === 1 ? "" : "s"} per project, files and pasted text together. Upgrade to add more.`,
    403,
  );
}

export async function POST(request: Request, { params }: Context) {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const { id: projectId } = await params;
  if (!(await getOwnedProject(projectId))) return projectNotFound();

  const parsed = requestKnowledgeUploadRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput("A file name and size are required.");
  const { fileName, size, title } = parsed.data;

  const type = extensionType(fileName);
  if (!type) return invalidInput("Only PDF, Markdown, and TXT files are supported.");
  if (size > MAX_KNOWLEDGE_FILE_BYTES) {
    return errorResponse(ERROR_CODES.invalidInput, `The file is too large. Max ${MAX_FILE_MB} MB.`, 413);
  }

  const service = createServiceClient();
  await reclaimAbandoned(service, projectId);

  const limit = PLAN_LIMITS[await getAccountPlan()].knowledgeSourcesPerProject;
  const sourceId = randomUUID();
  const storageKey = knowledgeFileKey(projectId, sourceId);

  const { data: row, error } = await service.rpc("reserve_knowledge_source", {
    p_project_id: projectId,
    p_title: title?.trim() || fileName,
    p_type: type,
    p_storage_key: storageKey,
    p_source_limit: limit,
    p_source_id: sourceId,
  });

  if (error) {
    if (error.code === "AWLIM") return sourceLimitReached(limit);
    if (error.code === "AWNOP") return projectNotFound();
    console.error(`reserve_knowledge_source failed for project ${projectId}`, error);
    return errorResponse(ERROR_CODES.internal, "Could not reserve the upload.", 500);
  }

  let signed: { path: string; token: string };
  try {
    signed = await createKnowledgeUploadUrl(storageKey);
  } catch (signError) {
    console.error(`Could not sign an upload URL for source ${sourceId}`, signError);
    // Never reached storage: free the slot rather than leaving a row with no way to upload to it.
    await service.from("knowledge_sources").delete().eq("id", sourceId);
    return errorResponse(ERROR_CODES.internal, "Could not prepare the upload.", 500);
  }

  return Response.json(
    { source: toKnowledgeSource(row), path: signed.path, token: signed.token } satisfies RequestKnowledgeUploadResponse,
    { status: 201 },
  );
}
