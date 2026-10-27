import { ERROR_CODES, type GetConversationResponse } from "@askwell/shared";
import { getConversationById } from "../../../../lib/conversations";
import { toThread } from "../../../../lib/data/conversations";
import { errorResponse, getOwnerId, unauthorized } from "../../../../lib/projects/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// Unknown id and not-owned both return 404, so a conversation's existence stays private (§9):
// RLS hides another owner's conversation from the owner client.
const conversationNotFound = () => errorResponse(ERROR_CODES.notFound, "Conversation not found.", 404);

export async function GET(_request: Request, { params }: Context) {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const { id } = await params;
  const conversation = await getConversationById(id);
  if (!conversation) return conversationNotFound();

  return Response.json({ conversation: toThread(conversation) } satisfies GetConversationResponse);
}
