// GET /api/conversations/:id: one conversation with its messages, oldest
// first (project.md §6.7, §8). Owner client only: RLS hides other owners'
// conversations, so those are a 404, never a 403 (§9).
import { API_ERROR_STATUS, idParams, type GetConversationResponse } from "@askwell/shared";
import { jsonError } from "../../../../lib/api/errors";
import { ownerRouteError, requireOwnerId } from "../../../../lib/api/owner";
import { parseInput } from "../../../../lib/api/validation";
import { getOwnConversation } from "../../../../lib/conversations/conversations";

export async function GET(_request: Request, ctx: RouteContext<"/api/conversations/[id]">): Promise<Response> {
  try {
    await requireOwnerId();

    const params = parseInput(idParams, await ctx.params);
    if (!params.success) return params.response;

    const found = await getOwnConversation(params.data.id);
    if (!found) return jsonError(API_ERROR_STATUS.not_found, "not_found", "Conversation not found.");

    const response: GetConversationResponse = found;
    return Response.json(response);
  } catch (error) {
    return ownerRouteError("GET /api/conversations/:id", error);
  }
}
