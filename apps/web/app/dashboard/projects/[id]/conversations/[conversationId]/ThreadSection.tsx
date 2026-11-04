import { notFound } from "next/navigation";
import { connection } from "next/server";
import { idParams } from "@askwell/shared";
import { ConversationThread } from "../../../../../../components/conversations/ConversationThread";
import { getOwnConversation } from "../../../../../../lib/conversations/conversations";
import { loadProject } from "../../project";

/**
 * Reads the conversation and its messages with the owner client (RLS hides
 * other owners'). A conversation from another of the caller's projects is a
 * 404 too: the URL's project must be the conversation's.
 */
export async function ThreadSection({ projectId, conversationId }: { projectId: string; conversationId: string }) {
  await connection();
  // Not a uuid: not a conversation, and not worth a database round trip.
  if (!idParams.safeParse({ id: conversationId }).success) notFound();
  const project = await loadProject(projectId);
  if (!project) notFound();
  const found = await getOwnConversation(conversationId);
  if (!found || found.conversation.project_id !== project.id) notFound();
  return <ConversationThread projectId={project.id} conversation={found.conversation} messages={found.messages} />;
}
