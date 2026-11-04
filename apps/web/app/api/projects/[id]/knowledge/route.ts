// POST /api/projects/:id/knowledge: add pasted text as a knowledge source,
// processed inside the request (project.md §6.4, §8, §9).
import {
  API_ERROR_STATUS,
  createTextSourceBody,
  idParams,
  type CreateTextSourceResponse,
} from "@askwell/shared";
import { getOwnPlan } from "../../../../../lib/accounts/account";
import { jsonError } from "../../../../../lib/api/errors";
import { ownerRouteError, projectNotFound, requireOwnerId } from "../../../../../lib/api/owner";
import { parseInput, parseJsonBody } from "../../../../../lib/api/validation";
import { normalizeText } from "../../../../../lib/knowledge/extract";
import { processSource } from "../../../../../lib/knowledge/process";
import { sourceLimitResponse } from "../../../../../lib/knowledge/responses";
import { deleteFiles, readSource, reserveSource, SourceLimitError } from "../../../../../lib/knowledge/sources";
import { getOwnedProject } from "../../../../../lib/projects/projects";

// Pasted text is at most MAX_PASTED_TEXT_LENGTH (50k characters): ~40 chunks,
// one embeddings request. 60 s leaves room for OpenAI's retries.
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/knowledge">): Promise<Response> {
  try {
    await requireOwnerId();

    const params = parseInput(idParams, await ctx.params);
    if (!params.success) return params.response;
    const body = await parseJsonBody(createTextSourceBody, request);
    if (!body.success) return body.response;

    // Ownership first (owner client, RLS); another owner's project is a 404 (§9).
    const project = await getOwnedProject(params.data.id);
    if (!project) return projectNotFound();

    // NUL characters would break the insert; normalizing can also leave nothing.
    const text = normalizeText(body.data.text);
    if (!text) {
      return jsonError(API_ERROR_STATUS.validation_failed, "validation_failed", "text: Paste some text.");
    }

    // The plan comes from the database, never the client (§9 "Plan bypass").
    const plan = await getOwnPlan();
    const { source, reclaimedKeys } = await reserveSource({
      projectId: project.id,
      title: body.data.title,
      kind: "text",
      plan,
    });
    await deleteFiles(reclaimedKeys);

    // A processing failure marks the source "failed"; the owner sees it in the list.
    await processSource({ sourceId: source.id, projectId: project.id, text });

    const response: CreateTextSourceResponse = { source: await readSource(source.id, project.id) };
    return Response.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof SourceLimitError) return sourceLimitResponse(error);
    return ownerRouteError("POST /api/projects/:id/knowledge", error);
  }
}
