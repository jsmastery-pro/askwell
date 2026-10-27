import { accounts, projects } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import { getOwnedProject } from "@askwell/db/queries";
import { ERROR_CODES, PLAN_LIMITS, addTextKnowledgeRequestSchema, MAX_KNOWLEDGE_FILE_BYTES, type AddKnowledgeResponse, type Plan } from "@askwell/shared";
import { eq } from "drizzle-orm";
import { runAfterResponse } from "../../../../../lib/knowledge/background";
import {
  countProjectKnowledgeSources,
  insertKnowledgeSource,
  processKnowledgeSource,
  toKnowledgeSource,
  type KnowledgeSourceRow,
  type NewSource,
} from "../../../../../lib/knowledge";
import { captureServerEvent } from "../../../../../lib/posthog/server";
import { errorResponse, getOwnerId, invalidInput, projectNotFound, readJson, unauthorized } from "../../../../../lib/projects/http";

export const dynamic = "force-dynamic";
// Covers the request plus its after() ingest (extract, chunk, embed) for pasted text up to
// MAX_KNOWLEDGE_FILE_BYTES. A file now goes through upload-url + finalize instead (SB-T06).
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

const MAX_FILE_MB = MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024);
// MAX_KNOWLEDGE_FILE_BYTES plus room for JSON overhead and the title field.
const MAX_REQUEST_BYTES = MAX_KNOWLEDGE_FILE_BYTES + 64 * 1024;

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

function created(ownerId: string, source: KnowledgeSourceRow) {
  captureServerEvent(ownerId, "knowledge_added", { project_id: source.projectId, type: source.type });
  return Response.json({ source: toKnowledgeSource(source) } satisfies AddKnowledgeResponse, { status: 201 });
}

async function handleText(projectId: string, ownerId: string, request: Request) {
  const parsed = addTextKnowledgeRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput("A title and content are required.");
  // Same cap as uploaded files, since both end up chunked and embedded the same way.
  if (Buffer.byteLength(parsed.data.content, "utf-8") > MAX_KNOWLEDGE_FILE_BYTES) {
    return invalidInput(`The pasted text is too large. Max ${MAX_FILE_MB} MB.`);
  }

  const reservation = await reserveSource(ownerId, { projectId, title: parsed.data.title, type: "text", storageKey: null });
  if (!reservation.ok) return sourceLimitReached(reservation.limit);
  const { source } = reservation;

  runAfterResponse(() => processKnowledgeSource(source.id, projectId, () => parsed.data.content));
  return created(ownerId, source);
}

export async function POST(request: Request, { params }: Context) {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const { id: projectId } = await params;
  if (!(await getOwnedProject(projectId, ownerId))) return projectNotFound();

  // Before reading anything: a huge body is refused without being buffered in memory (§9 File upload).
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return errorResponse(ERROR_CODES.invalidInput, `The pasted text is too large. Max ${MAX_FILE_MB} MB.`, 413);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return invalidInput("Send JSON to add pasted text. Upload a file through the knowledge upload flow.");
  }
  return handleText(projectId, ownerId, request);
}
