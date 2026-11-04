// DELETE /api/knowledge/:id: delete a knowledge source, its chunks and its
// file (project.md §6.4, §8, §9 "Tenant leak").
import { idParams, type DeletedResponse } from "@askwell/shared";
import { ownerRouteError, requireOwnerId } from "../../../../lib/api/owner";
import { parseInput } from "../../../../lib/api/validation";
import { sourceNotFound } from "../../../../lib/knowledge/responses";
import { deleteFiles, deleteSourceRow, getOwnedSource } from "../../../../lib/knowledge/sources";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/knowledge/[id]">): Promise<Response> {
  try {
    await requireOwnerId();

    const params = parseInput(idParams, await ctx.params);
    if (!params.success) return params.response;

    // Owner client (RLS): another owner's source is a 404, never 403 (§9).
    const source = await getOwnedSource(params.data.id);
    if (!source) return sourceNotFound();

    // Ownership is checked: the service client deletes the row (chunks
    // cascade), then the file. A file left behind is logged, not an error.
    await deleteSourceRow(source.id, source.project_id);
    await deleteFiles([source.storage_key]);

    const response: DeletedResponse = { id: source.id };
    return Response.json(response);
  } catch (error) {
    return ownerRouteError("DELETE /api/knowledge/:id", error);
  }
}
