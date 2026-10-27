import { ERROR_CODES, MAX_KNOWLEDGE_FILE_BYTES, finalizeKnowledgeUploadRequestSchema, type AddKnowledgeResponse } from "@askwell/shared";
import { getOwnedProject } from "@askwell/db/queries";
import { runAfterResponse } from "../../../../../../lib/knowledge/background";
import { extractFileText, hasPdfMagicBytes } from "../../../../../../lib/knowledge/extract";
import {
  deleteKnowledgeSource,
  getKnowledgeSourceById,
  processKnowledgeSource,
  toKnowledgeSource,
} from "../../../../../../lib/knowledge";
import { captureServerEvent } from "../../../../../../lib/posthog/server";
import { errorResponse, getOwnerId, invalidInput, projectNotFound, readJson, unauthorized } from "../../../../../../lib/projects/http";
import { deleteKnowledgeFile, readKnowledgeFile } from "../../../../../../lib/storage";

export const dynamic = "force-dynamic";
// Covers the request plus its after() ingest (extract, chunk, embed), same allowance as the text route.
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

const MAX_FILE_MB = MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024);
const uploadNotFound = () => errorResponse(ERROR_CODES.notFound, "Upload not found.", 404);

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
  if (!(await getOwnedProject(projectId, ownerId))) return projectNotFound();

  const parsed = finalizeKnowledgeUploadRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput("A source id is required.");

  const source = await getKnowledgeSourceById(parsed.data.sourceId);
  if (!source || source.projectId !== projectId || !source.storageKey) return uploadNotFound();
  if (source.status !== "processing") return invalidInput("This upload was already finalized.");
  if (source.type === "text") return uploadNotFound();
  const type = source.type;

  let buffer: Buffer;
  try {
    buffer = await readKnowledgeFile(source.storageKey);
  } catch (error) {
    console.error(`Could not read the uploaded object for source ${source.id}`, error);
    return errorResponse(ERROR_CODES.invalidInput, "The upload didn't complete. Try again.", 400);
  }

  if (buffer.byteLength === 0) return refuse(source.id, source.storageKey, "The upload didn't complete. Try again.", 400);
  if (buffer.byteLength > MAX_KNOWLEDGE_FILE_BYTES) {
    return refuse(source.id, source.storageKey, `The file is too large. Max ${MAX_FILE_MB} MB.`, 413);
  }
  if (type === "pdf" && !hasPdfMagicBytes(buffer)) {
    return refuse(source.id, source.storageKey, "The file is not a valid PDF.", 400);
  }

  captureServerEvent(ownerId, "knowledge_added", { project_id: projectId, type });
  runAfterResponse(() => processKnowledgeSource(source.id, projectId, () => extractFileText(type, buffer)));
  return Response.json({ source: toKnowledgeSource(source) } satisfies AddKnowledgeResponse, { status: 201 });
}
