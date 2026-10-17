import "server-only";
import { knowledgeChunks, knowledgeSources } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import { SOURCE_TYPES, type KnowledgeSource } from "@askwell/shared";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { embedTexts } from "../ai";
import { chunkText } from "./chunk";

export type SourceType = (typeof SOURCE_TYPES)[number];
export type KnowledgeSourceRow = typeof knowledgeSources.$inferSelect;

// Same shape check as getOwnedProject in packages/db: a malformed id would make Postgres
// throw on the uuid cast, so callers treat it as "not found" instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toKnowledgeSource(row: KnowledgeSourceRow): KnowledgeSource {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/** A project's sources, newest first. The caller is trusted to have already checked ownership. */
export async function listProjectKnowledgeSources(
  projectId: string,
  database: Database = defaultDb,
): Promise<KnowledgeSourceRow[]> {
  return database
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.projectId, projectId))
    .orderBy(desc(knowledgeSources.createdAt));
}

/** A single source by id, or `null` if it doesn't exist. Doesn't check ownership. */
export async function getKnowledgeSourceById(
  sourceId: string,
  database: Database = defaultDb,
): Promise<KnowledgeSourceRow | null> {
  if (!UUID_RE.test(sourceId)) return null;
  const [row] = await database.select().from(knowledgeSources).where(eq(knowledgeSources.id, sourceId)).limit(1);
  return row ?? null;
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
 * Deletes a source row. Its chunks cascade (FK `onDelete: "cascade"`). Used both to free a
 * file slot when an upload never reached storage, and for a real owner-requested delete —
 * callers handle the storage object themselves first in the latter case.
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
