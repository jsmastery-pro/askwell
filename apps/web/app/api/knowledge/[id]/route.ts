import { ERROR_CODES, type DeleteKnowledgeResponse } from "@askwell/shared";
import { getOwnedKnowledgeSource } from "../../../../lib/data/knowledge";
import { deleteKnowledgeSource } from "../../../../lib/knowledge";
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
  // Ownership: RLS hides another owner's source from the owner client, so it reads as not found.
  const source = await getOwnedKnowledgeSource(id);
  if (!source) return sourceNotFound();

  // The row goes first: if this throws, the storage object is untouched and the delete can be
  // retried. Once the row is gone, a storage failure only orphans the file, never the reverse
  // (P3-T03 notes: "orphan files are better than orphan chunks").
  await deleteKnowledgeSource(source.id);

  if (source.storage_key) {
    try {
      await deleteKnowledgeFile(source.storage_key);
    } catch (error) {
      console.error(`Could not delete storage object for knowledge source ${source.id}`, error);
    }
  }

  return Response.json({ ok: true } satisfies DeleteKnowledgeResponse);
}
