import "server-only";
import { knowledgeChunks, knowledgeSources } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import { SOURCE_TYPES, type KnowledgeSource } from "@askwell/shared";
import { and, count, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { embedTexts } from "../ai";
import { chunkText } from "./chunk";

export type SourceType = (typeof SOURCE_TYPES)[number];
export type KnowledgeSourceRow = typeof knowledgeSources.$inferSelect;

export function toKnowledgeSource(row: KnowledgeSourceRow): KnowledgeSource {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Files count toward the plan limit; pasted text doesn't (project.md §6.4). */
export async function countProjectKnowledgeFiles(projectId: string, database: Database = defaultDb): Promise<number> {
  const [row] = await database
    .select({ n: count() })
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.projectId, projectId), ne(knowledgeSources.type, "text")));
  return row?.n ?? 0;
}

type NewSource = { id?: string; projectId: string; title: string; type: SourceType; storageKey: string | null };

/**
 * Inserts a `processing` source. Pass `id` when the caller needs the id before inserting
 * (e.g. to derive the file's storage key up front and persist it in the same write).
 */
export async function insertKnowledgeSource(
  input: NewSource,
  database: Database = defaultDb,
): Promise<KnowledgeSourceRow> {
  const [row] = await database
    .insert(knowledgeSources)
    .values({ ...input, id: input.id ?? randomUUID() })
    .returning();
  return row!;
}

async function setSourceStatus(
  sourceId: string,
  status: "ready" | "failed",
  database: Database,
): Promise<void> {
  await database.update(knowledgeSources).set({ status }).where(eq(knowledgeSources.id, sourceId));
}

/**
 * Removes a source that never reached storage, so it doesn't permanently occupy a file slot
 * (the plan's file count only reflects files actually stored).
 */
export async function deleteKnowledgeSource(sourceId: string, database: Database = defaultDb): Promise<void> {
  await database.delete(knowledgeSources).where(eq(knowledgeSources.id, sourceId));
}

/**
 * Gets the source's text, chunks it, embeds it, and stores the chunks, then marks the source
 * `ready`. Any failure — extraction, embedding, or "no extractable text" — marks it `failed`
 * instead of throwing, since this runs after the response has already been sent.
 */
export async function processKnowledgeSource(
  sourceId: string,
  projectId: string,
  getText: () => Promise<string> | string,
  database: Database = defaultDb,
): Promise<void> {
  try {
    const text = await getText();
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("No extractable text");

    const vectors = await embedTexts(chunks);
    await database
      .insert(knowledgeChunks)
      .values(chunks.map((content, i) => ({ projectId, sourceId, content, embedding: vectors[i]! })));
    await setSourceStatus(sourceId, "ready", database);
  } catch (error) {
    console.error(`Knowledge ingest failed for source ${sourceId}`, error);
    await setSourceStatus(sourceId, "failed", database);
  }
}
