import { accounts, projects } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import { getOwnedProject } from "@askwell/db/queries";
import {
  ERROR_CODES,
  KNOWLEDGE_FILE_TYPES,
  MAX_KNOWLEDGE_FILE_BYTES,
  PLAN_LIMITS,
  addFileKnowledgeFieldsSchema,
  addTextKnowledgeRequestSchema,
  type AddKnowledgeResponse,
  type Plan,
} from "@askwell/shared";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { runAfterResponse } from "../../../../../lib/knowledge/background";
import { extractFileText, hasPdfMagicBytes } from "../../../../../lib/knowledge/extract";
import {
  countProjectKnowledgeSources,
  deleteKnowledgeSource,
  insertKnowledgeSource,
  processKnowledgeSource,
  toKnowledgeSource,
  type KnowledgeSourceRow,
  type NewSource,
} from "../../../../../lib/knowledge";
import { captureServerEvent } from "../../../../../lib/posthog/server";
import { errorResponse, getOwnerId, invalidInput, projectNotFound, readJson, unauthorized } from "../../../../../lib/projects/http";
import { knowledgeFileKey, uploadKnowledgeFile } from "../../../../../lib/storage";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function getOwnerPlan(ownerId: string): Promise<Plan> {
  const [row] = await defaultDb.select({ plan: accounts.plan }).from(accounts).where(eq(accounts.clerkUserId, ownerId));
  return row?.plan ?? "free";
}

/**
 * Inserts a source only while the project is under its plan's source limit, counting pasted
 * text and files alike (§5). Count-then-insert runs in one transaction with the project row
 * locked, so concurrent adds for the same project can't both read a count under the limit.
 */
async function reserveSource(ownerId: string, source: NewSource) {
  const limit = PLAN_LIMITS[await getOwnerPlan(ownerId)].knowledgeSourcesPerProject;
  const reserved = await defaultDb.transaction(async (tx) => {
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, source.projectId)).for("update");
    if ((await countProjectKnowledgeSources(source.projectId, tx)) >= limit) return null;
    return insertKnowledgeSource(source, tx);
  });
  return reserved ? { ok: true as const, source: reserved } : { ok: false as const, limit };
}

function sourceLimitReached(limit: number) {
  return errorResponse(
    ERROR_CODES.planLimit,
    `Your plan allows ${limit} knowledge source${limit === 1 ? "" : "s"} per project, files and pasted text together. Upgrade to add more.`,
    403,
  );
}

// The one success path for both pasted text and files.
function created(ownerId: string, source: KnowledgeSourceRow) {
  captureServerEvent(ownerId, "knowledge_added", { project_id: source.projectId, type: source.type });
  return Response.json({ source: toKnowledgeSource(source) } satisfies AddKnowledgeResponse, { status: 201 });
}

async function handleText(projectId: string, ownerId: string, request: Request) {
  const parsed = addTextKnowledgeRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput("A title and content are required.");
  // Same cap as uploaded files, since both end up chunked and embedded the same way.
  if (Buffer.byteLength(parsed.data.content, "utf-8") > MAX_KNOWLEDGE_FILE_BYTES) {
    return invalidInput("The pasted text is too large. Max 10 MB.");
  }

  const reservation = await reserveSource(ownerId, { projectId, title: parsed.data.title, type: "text", storageKey: null });
  if (!reservation.ok) return sourceLimitReached(reservation.limit);
  const { source } = reservation;

  runAfterResponse(() => processKnowledgeSource(source.id, projectId, () => parsed.data.content));
  return created(ownerId, source);
}

async function handleFile(projectId: string, ownerId: string, request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return invalidInput("Invalid form data.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return invalidInput("A file is required.");

  const titleField = form.get("title");
  const fieldsParsed = addFileKnowledgeFieldsSchema.safeParse({
    title: typeof titleField === "string" && titleField ? titleField : undefined,
  });
  if (!fieldsParsed.success) return invalidInput("Invalid title.");

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = KNOWLEDGE_FILE_TYPES[extension as keyof typeof KNOWLEDGE_FILE_TYPES];
  if (!type) return invalidInput("Only PDF, Markdown, and TXT files are supported.");
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) return invalidInput("The file is too large. Max 10 MB.");

  const buffer = Buffer.from(await file.arrayBuffer());
  if (type === "pdf" && !hasPdfMagicBytes(buffer)) return invalidInput("The file is not a valid PDF.");

  const title = fieldsParsed.data.title?.trim() || file.name;
  const sourceId = randomUUID();
  const storageKey = knowledgeFileKey(projectId, sourceId);

  const reservation = await reserveSource(ownerId, { id: sourceId, projectId, title, type, storageKey });
  if (!reservation.ok) return sourceLimitReached(reservation.limit);
  const { source } = reservation;

  try {
    await uploadKnowledgeFile(storageKey, buffer, file.type || "application/octet-stream");
  } catch (error) {
    console.error(`Knowledge file upload failed for source ${source.id}`, error);
    // Never reached storage: free the file slot rather than leaving a permanent `failed` row.
    await deleteKnowledgeSource(source.id);
    return errorResponse(ERROR_CODES.internal, "Could not store the file.", 500);
  }

  runAfterResponse(() => processKnowledgeSource(source.id, projectId, () => extractFileText(type, buffer)));
  return created(ownerId, source);
}

export async function POST(request: Request, { params }: Context) {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const { id: projectId } = await params;
  if (!(await getOwnedProject(projectId, ownerId))) return projectNotFound();

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return handleText(projectId, ownerId, request);
  if (contentType.includes("multipart/form-data")) return handleFile(projectId, ownerId, request);
  return invalidInput("Send JSON for pasted text or multipart form data for a file.");
}
