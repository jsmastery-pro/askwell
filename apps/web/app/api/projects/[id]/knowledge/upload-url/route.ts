import { accounts, knowledgeSources } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import { getOwnedProject } from "@askwell/db/queries";
import {
  ERROR_CODES,
  KNOWLEDGE_FILE_TYPES,
  MAX_KNOWLEDGE_FILE_BYTES,
  PLAN_LIMITS,
  requestKnowledgeUploadRequestSchema,
  type KnowledgeSource,
  type Plan,
  type RequestKnowledgeUploadResponse,
} from "@askwell/shared";
import { createServiceClient } from "@/lib/supabase/service";
import { and, eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { errorResponse, getOwnerId, invalidInput, projectNotFound, readJson, unauthorized } from "../../../../../../lib/projects/http";
import { createKnowledgeUploadUrl, deleteKnowledgeFile, knowledgeFileKey } from "../../../../../../lib/storage";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const MAX_FILE_MB = MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024);

// A signed upload URL is valid for 2 hours (Supabase's fixed default; it isn't configurable), so a
// reservation this old is unreachable either way — the browser's upload can no longer land. Reclaim
// it here, lazily, before counting against the plan's source limit, rather than running a cron for
// something that only needs to happen right before the next reservation.
const ABANDONED_AFTER_MS = 2 * 60 * 60 * 1000;

async function reclaimAbandoned(projectId: string): Promise<void> {
  const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS);
  const stale = await defaultDb
    .select({ id: knowledgeSources.id, storageKey: knowledgeSources.storageKey })
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.projectId, projectId),
        eq(knowledgeSources.status, "processing"),
        lt(knowledgeSources.createdAt, cutoff),
      ),
    );

  for (const row of stale) {
    await defaultDb.delete(knowledgeSources).where(eq(knowledgeSources.id, row.id));
    if (row.storageKey) {
      try {
        await deleteKnowledgeFile(row.storageKey);
      } catch (error) {
        console.error(`Couldn't remove the abandoned object for source ${row.id}`, error);
      }
    }
  }
}

async function getOwnerPlan(ownerId: string): Promise<Plan> {
  const [row] = await defaultDb.select({ plan: accounts.plan }).from(accounts).where(eq(accounts.clerkUserId, ownerId));
  return row?.plan ?? "free";
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

type ReservedRow = { id: string; title: string; type: string; status: string; created_at: string };

function toKnowledgeSource(row: ReservedRow): KnowledgeSource {
  return {
    id: row.id,
    title: row.title,
    type: row.type as KnowledgeSource["type"],
    status: row.status as KnowledgeSource["status"],
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function POST(request: Request, { params }: Context) {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const { id: projectId } = await params;
  if (!(await getOwnedProject(projectId, ownerId))) return projectNotFound();

  const parsed = requestKnowledgeUploadRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput("A file name and size are required.");
  const { fileName, size, title } = parsed.data;

  const type = extensionType(fileName);
  if (!type) return invalidInput("Only PDF, Markdown, and TXT files are supported.");
  if (size > MAX_KNOWLEDGE_FILE_BYTES) {
    return errorResponse(ERROR_CODES.invalidInput, `The file is too large. Max ${MAX_FILE_MB} MB.`, 413);
  }

  await reclaimAbandoned(projectId);

  const limit = PLAN_LIMITS[await getOwnerPlan(ownerId)].knowledgeSourcesPerProject;
  const sourceId = randomUUID();
  const storageKey = knowledgeFileKey(projectId, sourceId);

  const service = createServiceClient();
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
    await defaultDb.delete(knowledgeSources).where(eq(knowledgeSources.id, sourceId));
    return errorResponse(ERROR_CODES.internal, "Could not prepare the upload.", 500);
  }

  return Response.json(
    { source: toKnowledgeSource(row as ReservedRow), path: signed.path, token: signed.token } satisfies RequestKnowledgeUploadResponse,
    { status: 201 },
  );
}
