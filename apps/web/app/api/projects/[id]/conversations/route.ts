import { getOwnedProject } from "@askwell/db/queries";
import type { ListConversationsResponse } from "@askwell/shared";
import { listProjectConversations } from "../../../../../lib/conversations";
import { getOwnerId, projectNotFound, unauthorized } from "../../../../../lib/projects/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// Not found and not owned both return 404, so project existence stays private (§9).

export async function GET(_request: Request, { params }: Context) {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const { id: projectId } = await params;
  if (!(await getOwnedProject(projectId, ownerId))) return projectNotFound();

  const conversations = await listProjectConversations(projectId);
  return Response.json({ conversations } satisfies ListConversationsResponse);
}
