import { asc, cosineDistance, eq } from "drizzle-orm";
import type { Database } from "./projects";
import { db as defaultDb } from "../client";
import * as schema from "../schema";

export type ChunkMatch = {
  content: string;
  distance: number;
};

// Matches RETRIEVAL_TOP_K in packages/shared/src/ai.ts (chunks retrieved per chat question, §6.6).
// Not imported directly: packages/db has no dependency on @askwell/shared.
const DEFAULT_TOP_K = 5;

/**
 * Top `k` chunks for `projectId` by cosine distance to `embedding`, nearest first.
 * Always scoped to `projectId` — never returns another project's chunks (§9 Tenant leak).
 */
export async function searchChunks(
  projectId: string,
  embedding: number[],
  k: number = DEFAULT_TOP_K,
  database: Database = defaultDb,
): Promise<ChunkMatch[]> {
  const distance = cosineDistance(schema.knowledgeChunks.embedding, embedding).mapWith(Number);

  return database
    .select({
      content: schema.knowledgeChunks.content,
      distance,
    })
    .from(schema.knowledgeChunks)
    .where(eq(schema.knowledgeChunks.projectId, projectId))
    .orderBy(asc(distance))
    .limit(k);
}
