// Turns a source's text into stored, searchable chunks (project.md §6.4
// Processing): chunk → embed → insert into knowledge_chunks → source "ready".
//
// Uses the service client: knowledge processing is a write owners can't make
// (§7). The caller (a knowledge route) has already checked the owner owns
// `projectId` and that `sourceId` belongs to it. Every chunk's project_id is
// that argument, never anything read from the text (§9 "Tenant leak").
import "server-only";
import { embedTexts } from "../ai/openai";
import { createServiceClient, type ServiceClient } from "../supabase/service";
import { chunkText } from "./chunk";

/** Rows per insert. Each row carries a 1536-float vector (~30 KB of JSON). */
export const CHUNK_INSERT_BATCH_SIZE = 50;

export type ProcessSourceInput = {
  sourceId: string;
  projectId: string;
  /** The source's text: pasted, or extracted from its file. */
  text: string;
};

export type ProcessSourceResult = { status: "ready"; chunkCount: number } | { status: "failed"; error: Error };

/** The text gave no chunks (empty or whitespace only). */
export class EmptyTextError extends Error {
  constructor() {
    super("The source has no text to process.");
    this.name = "EmptyTextError";
  }
}

/** A Supabase step failed; `cause` is the PostgREST error. */
export class ProcessStepError extends Error {
  constructor(step: string, cause: unknown) {
    super(`Knowledge processing failed to ${step}.`, { cause });
    this.name = "ProcessStepError";
  }
}

async function deleteChunks(db: ServiceClient, sourceId: string, projectId: string): Promise<void> {
  const { error } = await db
    .from("knowledge_chunks")
    .delete()
    .eq("source_id", sourceId)
    .eq("project_id", projectId);
  if (error) throw new ProcessStepError("delete old chunks", error);
}

async function setStatus(db: ServiceClient, sourceId: string, projectId: string, status: "ready" | "failed") {
  const { error } = await db
    .from("knowledge_sources")
    .update({ status })
    .eq("id", sourceId)
    .eq("project_id", projectId);
  if (error) throw new ProcessStepError(`mark the source ${status}`, error);
}

async function storeChunks(db: ServiceClient, input: ProcessSourceInput): Promise<number> {
  const chunks = chunkText(input.text);
  if (chunks.length === 0) throw new EmptyTextError();

  const vectors = await embedTexts(chunks);
  const rows = chunks.map((content, i) => ({
    project_id: input.projectId,
    source_id: input.sourceId,
    content,
    // pgvector's text form, "[0.1,0.2,…]", which is what JSON.stringify gives.
    embedding: JSON.stringify(vectors[i]),
  }));

  for (let start = 0; start < rows.length; start += CHUNK_INSERT_BATCH_SIZE) {
    const { error } = await db.from("knowledge_chunks").insert(rows.slice(start, start + CHUNK_INSERT_BATCH_SIZE));
    if (error) throw new ProcessStepError("insert chunks", error);
  }
  return rows.length;
}

/**
 * Processes one source. Idempotent: it first deletes any chunks the source
 * already has. On any error it deletes the partial chunks, marks the source
 * "failed", logs, and returns the error; it never throws for a processing
 * failure. It throws only if it can't even mark the source failed.
 */
export async function processSource(input: ProcessSourceInput): Promise<ProcessSourceResult> {
  const db = createServiceClient();

  try {
    await deleteChunks(db, input.sourceId, input.projectId);
    const chunkCount = await storeChunks(db, input);
    await setStatus(db, input.sourceId, input.projectId, "ready");
    return { status: "ready", chunkCount };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    console.error(`[knowledge] processing source ${input.sourceId} failed:`, error);

    // Leave no partial chunks. If this cleanup fails too, still mark the source
    // failed (and log it): deleting the source or processing it again removes
    // the leftovers.
    try {
      await deleteChunks(db, input.sourceId, input.projectId);
    } catch (cleanupError) {
      console.error(`[knowledge] deleting partial chunks of source ${input.sourceId} failed:`, cleanupError);
    }
    await setStatus(db, input.sourceId, input.projectId, "failed");
    return { status: "failed", error };
  }
}
