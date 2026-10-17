import { accounts } from "@askwell/db";
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
  countProjectKnowledgeFiles,
  failKnowledgeSource,
  insertKnowledgeSource,
  processKnowledgeSource,
  toKnowledgeSource,
} from "../../../../../lib/knowledge";
import { errorResponse, getOwnerId, invalidInput, projectNotFound, readJson, unauthorized } from "../../../../../lib/projects/http";
import { knowledgeFileKey, uploadKnowledgeFile } from "../../../../../lib/storage";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function getOwnerPlan(ownerId: string): Promise<Plan> {
  const [row] = await defaultDb.select({ plan: accounts.plan }).from(accounts).where(eq(accounts.clerkUserId, ownerId));
  return row?.plan ?? "free";
}

function created(response: AddKnowledgeResponse) {
  return Response.json(response, { status: 201 });
}

async function handleText(projectId: string, request: Request) {
  const parsed = addTextKnowledgeRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput("A title and content are required.");

  const source = await insertKnowledgeSource({
    projectId,
    title: parsed.data.title,
    type: "text",
    storageKey: null,
  });

  runAfterResponse(() => processKnowledgeSource(source.id, projectId, () => parsed.data.content));
  return created({ source: toKnowledgeSource(source) });
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

  const plan = await getOwnerPlan(ownerId);
  const limit = PLAN_LIMITS[plan].knowledgeFilesPerProject;
  const fileCount = await countProjectKnowledgeFiles(projectId);
  if (fileCount >= limit) {
    return errorResponse(
      ERROR_CODES.planLimit,
      `Your plan allows ${limit} knowledge file${limit === 1 ? "" : "s"} per project. Upgrade to add more.`,
      403,
    );
  }

  const title = fieldsParsed.data.title?.trim() || file.name;
  const sourceId = randomUUID();
  const storageKey = knowledgeFileKey(projectId, sourceId);
  const source = await insertKnowledgeSource({ id: sourceId, projectId, title, type, storageKey });

  try {
    await uploadKnowledgeFile(storageKey, buffer, file.type || "application/octet-stream");
  } catch (error) {
    console.error(`Knowledge file upload failed for source ${source.id}`, error);
    await failKnowledgeSource(source.id);
    return errorResponse(ERROR_CODES.internal, "Could not store the file.", 500);
  }

  runAfterResponse(() => processKnowledgeSource(source.id, projectId, () => extractFileText(type, buffer)));
  return created({ source: toKnowledgeSource(source) });
}

export async function POST(request: Request, { params }: Context) {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const { id: projectId } = await params;
  if (!(await getOwnedProject(projectId, ownerId))) return projectNotFound();

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return handleText(projectId, request);
  if (contentType.includes("multipart/form-data")) return handleFile(projectId, ownerId, request);
  return invalidInput("Send JSON for pasted text or multipart form data for a file.");
}
