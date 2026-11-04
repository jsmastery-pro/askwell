import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ConversationsList } from "../../../../../components/conversations/ConversationsList";
import { listOwnConversations } from "../../../../../lib/conversations/conversations";
import { loadProject } from "../project";

/**
 * Reads the project and the first page of its conversations with the owner
 * client (RLS), then hands them to the client-side list. Render inside
 * <Suspense>. connection() first: it reads the session and the clock, so it
 * never runs in a prerender.
 */
export async function ConversationsSection({ projectId }: { projectId: string }) {
  await connection();
  const project = await loadProject(projectId);
  if (!project) notFound();
  const page = await listOwnConversations(project.id);
  return <ConversationsList projectId={project.id} initialPage={page} now={new Date().toISOString()} />;
}
