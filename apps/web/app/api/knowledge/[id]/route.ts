import { getOwnedProject } from "@askwell/db/queries";
import { ERROR_CODES, type DeleteKnowledgeResponse } from "@askwell/shared";
import { deleteKnowledgeSource, getKnowledgeSourceById } from "../../../../lib/knowledge";
import { errorResponse, getOwnerId, unauthorized } from "../../../../lib/projects/http";
import { deleteKnowledgeFile } from "../../../../lib/storage";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// Unknown id and not-owned both return 404, so a source's existence stays private (§9).
const sourceNotFound = () => errorResponse(ERROR_CODES.notFound, "Knowledge source not found.", 404);

export async function DELETE(_request: Request, { params }: Context) {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const { id } = await params;
  const source = await getKnowledgeSourceById(id);
  if (!source) return sourceNotFound();
  if (!(await getOwnedProject(source.projectId, ownerId))) return sourceNotFound();

  if (source.storageKey) {
    try {
      await deleteKnowledgeFile(source.storageKey);
    } catch (error) {
      // Orphan files are better than orphan chunks (P3-T03 notes): still delete the row.
      console.error(`Could not delete storage object for knowledge source ${source.id}`, error);
    }
  }

  await deleteKnowledgeSource(source.id);
  return Response.json({ ok: true } satisfies DeleteKnowledgeResponse);
}
