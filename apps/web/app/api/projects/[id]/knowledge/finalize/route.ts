// POST /api/projects/:id/knowledge/finalize: claim an uploaded file once,
// check the real file, extract its text and process it (project.md §6.4,
// §9 "File upload"). A refused file is deleted with its source.
import { finalizeUploadBody, idParams, type FinalizeUploadResponse } from "@askwell/shared";
import { ownerRouteError, projectNotFound, requireOwnerId } from "../../../../../../lib/api/owner";
import { parseInput, parseJsonBody } from "../../../../../../lib/api/validation";
import { ExtractError, extractText } from "../../../../../../lib/knowledge/extract";
import { processSource } from "../../../../../../lib/knowledge/process";
import { refused, sourceNotFound } from "../../../../../../lib/knowledge/responses";
import {
  checkTextSize,
  checkUploadedFile,
  claimSource,
  deleteFiles,
  deleteSourceRow,
  downloadFile,
  markSourceFailed,
  readSource,
} from "../../../../../../lib/knowledge/sources";
import { getOwnedProject } from "../../../../../../lib/projects/projects";

// A 10 MB file is capped at MAX_CHUNKS_PER_SOURCE chunks: ~20 embeddings
// requests and ~40 insert batches. 300 s (Vercel's limit with Fluid compute
// on every plan) covers that with room for OpenAI's retries.
export const maxDuration = 300;

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[id]/knowledge/finalize">,
): Promise<Response> {
  try {
    await requireOwnerId();

    const params = parseInput(idParams, await ctx.params);
    if (!params.success) return params.response;
    const body = await parseJsonBody(finalizeUploadBody, request);
    if (!body.success) return body.response;

    const project = await getOwnedProject(params.data.id);
    if (!project) return projectNotFound();

    // Once only: uploading → processing. Unknown, another project's, already
    // finalized, or reclaimed → no row.
    const source = await claimSource(body.data.sourceId, project.id);
    if (!source) return sourceNotFound("This upload doesn't exist or was already finalized.");
    // From here on the source is claimed, so the 2-hour reclaim never touches
    // it: an unexpected error marks it "failed" (the owner can see and delete
    // it) instead of leaving it "processing". A timeout can't be caught here.
    try {
      const { storage_key: storageKey, type } = source;
      if (!storageKey || type === "text") throw new Error(`Claimed source ${source.id} has no file.`);

      /** Deletes the file and its source, then answers 400 with `message`. */
      const refuse = async (message: string) => {
        await deleteSourceRow(source.id, project.id);
        await deleteFiles([storageKey]);
        return refused(message);
      };

      const bytes = await downloadFile(storageKey);
      if (!bytes) return refuse("The file wasn't uploaded. Try again.");

      const problem = checkUploadedFile(bytes, type);
      if (problem) return refuse(problem);

      let text: string;
      try {
        text = await extractText(bytes, type);
      } catch (error) {
        if (error instanceof ExtractError) return refuse(error.message);
        throw error;
      }

      const tooBig = checkTextSize(text);
      if (tooBig) return refuse(tooBig);

      // A processing failure marks the source "failed" itself; the file stays
      // so the owner can see it and delete it.
      await processSource({ sourceId: source.id, projectId: project.id, text });
    } catch (error) {
      await markSourceFailed(source.id, project.id);
      throw error;
    }

    // Outside the try: by now the source is "ready" or "failed" already.
    const response: FinalizeUploadResponse = { source: await readSource(source.id, project.id) };
    return Response.json(response);
  } catch (error) {
    return ownerRouteError("POST /api/projects/:id/knowledge/finalize", error);
  }
}
