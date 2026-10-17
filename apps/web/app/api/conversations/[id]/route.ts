import { getOwnedProject } from "@askwell/db/queries";
import { ERROR_CODES, type GetConversationResponse } from "@askwell/shared";
import { getConversationById } from "../../../../lib/conversations";
import { errorResponse, getOwnerId, unauthorized } from "../../../../lib/projects/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// Unknown id and not-owned both return 404, so a conversation's existence stays private (§9).
const conversationNotFound = () => errorResponse(ERROR_CODES.notFound, "Conversation not found.", 404);

export async function GET(_request: Request, { params }: Context) {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const { id } = await params;
  const conversation = await getConversationById(id);
  if (!conversation) return conversationNotFound();
  if (!(await getOwnedProject(conversation.projectId, ownerId))) return conversationNotFound();

  return Response.json({
    conversation: {
      id: conversation.id,
      visitorId: conversation.visitorId,
      createdAt: conversation.createdAt.toISOString(),
      messages: conversation.messages,
    },
  } satisfies GetConversationResponse);
}
