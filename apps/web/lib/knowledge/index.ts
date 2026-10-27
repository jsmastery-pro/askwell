import "server-only";
import { createServiceClient } from "../supabase/service";
import { unwrap } from "../supabase/query";
import { embedTexts } from "../ai";
import { chunkText } from "./chunk";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Deletes a source row. Its chunks cascade (FK `onDelete: "cascade"`). Row only — never the
 * storage object (SB-T07): every caller (the knowledge-delete route, finalize's refusal cleanup,
 * upload-url's abandoned-reservation reclaim) already removes the object itself, in whichever
 * order its own error-handling needs, so this never double-deletes it.
 */
export async function deleteKnowledgeSource(sourceId: string, service: ServiceClient = createServiceClient()): Promise<void> {
  unwrap(await service.from("knowledge_sources").delete().eq("id", sourceId));
}

async function setSourceStatus(service: ServiceClient, sourceId: string, status: "ready" | "failed"): Promise<void> {
  unwrap(await service.from("knowledge_sources").update({ status }).eq("id", sourceId));
}

// One insert per batch, not per row, and not one insert for the whole file either: a 10 MB PDF
// can produce thousands of chunks, and a single request for all of them risks the route's own
// maxDuration (300s) and PostgREST's request size limit. 200 keeps each request a few MB
// (content text + a 1536-dim embedding per row) and the round-trip count low.
const CHUNK_INSERT_BATCH_SIZE = 200;

/**
 * Gets the source's text, chunks it, embeds it, and stores the chunks, then marks the source
 * `ready`. Any failure — extraction, embedding, or "no extractable text" — marks it `failed`
 * instead of throwing, since this runs after the response has already been sent.
 */
export async function processKnowledgeSource(
  sourceId: string,
  projectId: string,
  getText: () => Promise<string> | string,
  service: ServiceClient = createServiceClient(),
): Promise<void> {
  try {
    const text = await getText();
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("No extractable text");

    const vectors = await embedTexts(chunks);
    // pgvector columns are typed as `string` (the generator has no TS type for `vector`), and
    // JSON's array syntax is also pgvector's text input syntax, same as match_chunks' query vector.
    const rows = chunks.map((content, i) => ({
      project_id: projectId,
      source_id: sourceId,
      content,
      embedding: JSON.stringify(vectors[i]!),
    }));
    for (let start = 0; start < rows.length; start += CHUNK_INSERT_BATCH_SIZE) {
      unwrap(await service.from("knowledge_chunks").insert(rows.slice(start, start + CHUNK_INSERT_BATCH_SIZE)));
    }
    await setSourceStatus(service, sourceId, "ready");
  } catch (error) {
    console.error(`Knowledge ingest failed for source ${sourceId}`, error);
    // This runs after the response has already been sent (runAfterResponse/after()): a failure
    // here must never throw, or it becomes an unhandled rejection with no one left to catch it.
    try {
      await setSourceStatus(service, sourceId, "failed");
    } catch (statusError) {
      console.error(`Could not mark source ${sourceId} failed`, statusError);
    }
  }
}
