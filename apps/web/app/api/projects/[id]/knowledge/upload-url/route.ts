// POST /api/projects/:id/knowledge/upload-url: reserve a file source and
// return a one-time signed upload for the private bucket. The browser then
// uploads straight to Storage; the file never passes through our routes
// (project.md §3 File storage, §6.4, §9 "File upload").
import {
  createUploadUrlBody,
  fileExtension,
  idParams,
  isAllowedFileExtension,
  type CreateUploadUrlResponse,
} from "@askwell/shared";
import { getOwnPlan } from "../../../../../../lib/accounts/account";
import { ownerRouteError, projectNotFound, requireOwnerId } from "../../../../../../lib/api/owner";
import { parseInput, parseJsonBody } from "../../../../../../lib/api/validation";
import { sourceLimitResponse } from "../../../../../../lib/knowledge/responses";
import {
  createSignedUpload,
  deleteFiles,
  deleteSourceRow,
  newStorageKey,
  reserveSource,
  SourceLimitError,
} from "../../../../../../lib/knowledge/sources";
import { getOwnedProject } from "../../../../../../lib/projects/projects";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[id]/knowledge/upload-url">,
): Promise<Response> {
  try {
    await requireOwnerId();

    const params = parseInput(idParams, await ctx.params);
    if (!params.success) return params.response;
    // Declared size (≤ 10 MB), extension and MIME type; finalize checks the real file.
    const body = await parseJsonBody(createUploadUrlBody, request);
    if (!body.success) return body.response;

    const project = await getOwnedProject(params.data.id);
    if (!project) return projectNotFound();

    const ext = fileExtension(body.data.fileName);
    // The schema already refused anything else; this narrows the type.
    if (!isAllowedFileExtension(ext)) throw new Error(`Unexpected extension after validation: ${ext}`);

    const plan = await getOwnPlan();
    const storageKey = newStorageKey(project.id, ext);
    const { source, reclaimedKeys } = await reserveSource({
      projectId: project.id,
      title: body.data.fileName,
      kind: "file",
      ext,
      storageKey,
      plan,
    });
    await deleteFiles(reclaimedKeys);

    let upload: CreateUploadUrlResponse["upload"];
    try {
      upload = await createSignedUpload(storageKey);
    } catch (error) {
      // Don't leave a reservation holding a slot for 2 hours.
      await deleteSourceRow(source.id, project.id);
      throw error;
    }

    const response: CreateUploadUrlResponse = { source, upload };
    return Response.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof SourceLimitError) return sourceLimitResponse(error);
    return ownerRouteError("POST /api/projects/:id/knowledge/upload-url", error);
  }
}
