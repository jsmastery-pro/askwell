// GET /api/projects/:id/conversations?before=<cursor>: the project's
// conversations, newest first, CONVERSATIONS_PAGE_SIZE per page, each with
// its first visitor message and message count (project.md §6.7, §8).
// Owner client only, so RLS scopes every read. Another owner's project gets
// 404, never 403 (§9).
import { idParams, listConversationsQuery, type ListConversationsResponse } from "@askwell/shared";
import { ownerRouteError, projectNotFound, requireOwnerId } from "../../../../../lib/api/owner";
import { parseInput, parseQuery } from "../../../../../lib/api/validation";
import { listOwnConversations } from "../../../../../lib/conversations/conversations";
import { getOwnedProject } from "../../../../../lib/projects/projects";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/projects/[id]/conversations">,
): Promise<Response> {
  try {
    await requireOwnerId();

    const params = parseInput(idParams, await ctx.params);
    if (!params.success) return params.response;
    const query = parseQuery(listConversationsQuery, new URL(request.url).searchParams);
    if (!query.success) return query.response;

    const project = await getOwnedProject(params.data.id);
    if (!project) return projectNotFound();

    const response: ListConversationsResponse = await listOwnConversations(project.id, query.data.before);
    return Response.json(response);
  } catch (error) {
    return ownerRouteError("GET /api/projects/:id/conversations", error);
  }
}
