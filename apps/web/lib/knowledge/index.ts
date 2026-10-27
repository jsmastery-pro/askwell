import "server-only";
import { knowledgeSources } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import type { Tables } from "@askwell/db/types";
import { SOURCE_TYPES, type KnowledgeSource } from "@askwell/shared";
import { eq, desc } from "drizzle-orm";
import { createServiceClient } from "../supabase/service";
import { unwrap } from "../supabase/query";
import { embedTexts } from "../ai";
import { chunkText } from "./chunk";

export type SourceType = (typeof SOURCE_TYPES)[number];
export type KnowledgeSourceRow = typeof knowledgeSources.$inferSelect;

type ServiceClient = ReturnType<typeof createServiceClient>;

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

type SourceRow = Pick<Tables<"knowledge_sources">, "id" | "project_id" | "title" | "type" | "storage_key" | "status" | "created_at">;

function fromRawRow(row: SourceRow): KnowledgeSourceRow {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    type: row.type,
    storageKey: row.storage_key,
    // Drizzle's schema enum (packages/db, out of this task's scope) doesn't have 'uploading' yet;
    // the real column does (SB-T06), and a source fetched here can be in that status.
    status: row.status as KnowledgeSourceRow["status"],
    createdAt: new Date(row.created_at),
  };
}

const SOURCE_COLUMNS = "id, project_id, title, type, storage_key, status, created_at";

/**
 * A project's sources, newest first. The caller is trusted to have already checked ownership.
 *
 * Stays on Drizzle (SB-T07): this is an owner read, which SB-T04 moves onto the owner client
 * (RLS), not the service client — SB-T08 removes this Drizzle helper once that lands.
 */
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
  service: ServiceClient = createServiceClient(),
): Promise<KnowledgeSourceRow | null> {
  if (!UUID_RE.test(sourceId)) return null;
  const data = unwrap(await service.from("knowledge_sources").select(SOURCE_COLUMNS).eq("id", sourceId).maybeSingle());
  return data ? fromRawRow(data) : null;
}

/**
 * Every source counts toward the plan limit: uploaded files and pasted text alike (§5, §6.4).
 *
 * Stays on Drizzle (SB-T07): this is an owner read, which SB-T04 moves onto the owner client
 * (RLS), not the service client — SB-T08 removes this Drizzle helper once that lands.
 */
export async function countProjectKnowledgeSources(projectId: string, database: Database = defaultDb): Promise<number> {
  const rows = await database.select({ id: knowledgeSources.id }).from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId));
  return rows.length;
}

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
    await setSourceStatus(service, sourceId, "failed");
  }
}
