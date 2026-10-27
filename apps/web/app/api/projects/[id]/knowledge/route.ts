import { getOwnedProject } from "@askwell/db/queries";
import { ERROR_CODES, PLAN_LIMITS, addTextKnowledgeRequestSchema, MAX_KNOWLEDGE_FILE_BYTES, type AddKnowledgeResponse, type KnowledgeSource, type Plan } from "@askwell/shared";
import { createServiceClient } from "../../../../../lib/supabase/service";
import { runAfterResponse } from "../../../../../lib/knowledge/background";
import { processKnowledgeSource } from "../../../../../lib/knowledge";
import { captureServerEvent } from "../../../../../lib/posthog/server";
import { errorResponse, getOwnerId, invalidInput, projectNotFound, readJson, unauthorized } from "../../../../../lib/projects/http";

export const dynamic = "force-dynamic";
// Covers the request plus its after() ingest (extract, chunk, embed) for pasted text up to
// MAX_KNOWLEDGE_FILE_BYTES. A file now goes through upload-url + finalize instead (SB-T06).
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };
type ServiceClient = ReturnType<typeof createServiceClient>;

const MAX_FILE_MB = MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024);
// MAX_KNOWLEDGE_FILE_BYTES plus room for JSON overhead and the title field.
const MAX_REQUEST_BYTES = MAX_KNOWLEDGE_FILE_BYTES + 64 * 1024;

async function getOwnerPlan(service: ServiceClient, ownerId: string): Promise<Plan> {
  const { data } = await service.from("accounts").select("plan").eq("clerk_user_id", ownerId).maybeSingle();
  return (data as { plan: Plan } | null)?.plan ?? "free";
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

async function handleText(projectId: string, ownerId: string, request: Request) {
  const parsed = addTextKnowledgeRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput("A title and content are required.");
  // Same cap as uploaded files, since both end up chunked and embedded the same way.
  if (Buffer.byteLength(parsed.data.content, "utf-8") > MAX_KNOWLEDGE_FILE_BYTES) {
    return invalidInput(`The pasted text is too large. Max ${MAX_FILE_MB} MB.`);
  }

  const service = createServiceClient();
  const limit = PLAN_LIMITS[await getOwnerPlan(service, ownerId)].knowledgeSourcesPerProject;

  // Pasted text has no storage key: the function inserts it straight to `processing` (SB-T06),
  // the same atomic lock+count+insert files use, so pasted text and files count together (§5).
  // `db:types` still has this argument as required (generated from dev, before this PR's
  // migration makes it nullable there); the cast bridges that until dev catches up.
  const { data: row, error } = await service.rpc("reserve_knowledge_source", {
    p_project_id: projectId,
    p_title: parsed.data.title,
    p_type: "text",
    p_storage_key: null as unknown as string,
    p_source_limit: limit,
  });
  if (error) {
    if (error.code === "AWLIM") return sourceLimitReached(limit);
    if (error.code === "AWNOP") return projectNotFound();
    console.error(`reserve_knowledge_source failed for project ${projectId}`, error);
    return errorResponse(ERROR_CODES.internal, "Could not add this text.", 500);
  }
  const source = row as ReservedRow;

  runAfterResponse(() => processKnowledgeSource(source.id, projectId, () => parsed.data.content));
  captureServerEvent(ownerId, "knowledge_added", { project_id: projectId, type: "text" });
  return Response.json({ source: toKnowledgeSource(source) } satisfies AddKnowledgeResponse, { status: 201 });
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
