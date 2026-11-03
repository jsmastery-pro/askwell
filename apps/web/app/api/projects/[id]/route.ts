// PATCH /api/projects/:id: rename the owner's project (name only).
// DELETE /api/projects/:id: delete it, with everything in it.
// Both use the owner client, so RLS only ever touches the caller's own rows.
// Another owner's project gets 404, never 403, so its existence isn't revealed (§9).
import {
  idParams,
  updateProjectBody,
  type DeletedResponse,
  type UpdateProjectResponse,
} from "@askwell/shared";
import { ownerRouteError, projectNotFound, requireOwnerId } from "../../../../lib/api/owner";
import { parseInput, parseJsonBody } from "../../../../lib/api/validation";
import { deleteOwnProject, renameOwnProject } from "../../../../lib/projects/projects";

export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]">): Promise<Response> {
  try {
    await requireOwnerId();

    const params = parseInput(idParams, await ctx.params);
    if (!params.success) return params.response;
    const body = await parseJsonBody(updateProjectBody, request);
    if (!body.success) return body.response;

    const project = await renameOwnProject(params.data.id, body.data.name);
    if (!project) return projectNotFound();

    const response: UpdateProjectResponse = { project };
    return Response.json(response);
  } catch (error) {
    return ownerRouteError("PATCH /api/projects/:id", error);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/projects/[id]">): Promise<Response> {
  try {
    await requireOwnerId();

    const params = parseInput(idParams, await ctx.params);
    if (!params.success) return params.response;

    const id = await deleteOwnProject(params.data.id);
    if (!id) return projectNotFound();

    const response: DeletedResponse = { id };
    return Response.json(response);
  } catch (error) {
    return ownerRouteError("DELETE /api/projects/:id", error);
  }
}
