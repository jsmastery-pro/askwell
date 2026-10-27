#!/usr/bin/env -S pnpm exec tsx --conditions=react-server
// Dev tool: seeds a project with real knowledge chunks, so the chat route (P3-T05) can be
// tested before Lane A's upload pipeline (P3-T02) exists. Dev only: never run it against production.
//
// Usage:
//   pnpm seed-knowledge <publicKey> <path-to-text-file> [title]
//
// Reads the Supabase service-role env vars and OPENAI_API_KEY from .env.local / .env, checking
// this app's own directory first and the repo root second (where this monorepo's secrets
// actually live). The dev project is shared by everyone, so seeded rows are visible to the team.

import { CHUNKING } from "@askwell/shared";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { embedTexts } from "../lib/ai";
import { unwrap, unwrapRow } from "../lib/supabase/query";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// Earlier files win: loadEnvFile never overwrites a variable that's already set.
for (const file of [".env.local", ".env", join(repoRoot, ".env.local"), join(repoRoot, ".env")]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Fine if a candidate doesn't exist; env may already be set some other way (e.g. exported in the shell).
  }
}

// Dynamic, after the env-loading loop above: a static import is evaluated before the loop runs, so
// nothing the service client's module graph reads from env at load could see the loaded files.
const { createServiceClient } = await import("../lib/supabase/service");

// No real tokenizer here — this is a seeding tool, not the ingest pipeline (P3-T02 owns that).
// ~0.75 words per token is a common rough approximation for English text.
const WORDS_PER_TOKEN = 0.75;
const MAX_WORDS = Math.round(CHUNKING.maxTokens * WORDS_PER_TOKEN);
const OVERLAP_WORDS = Math.round(CHUNKING.overlapTokens * WORDS_PER_TOKEN);

function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  const step = MAX_WORDS - OVERLAP_WORDS;
  for (let start = 0; start < words.length; start += step) {
    chunks.push(words.slice(start, start + MAX_WORDS).join(" "));
    if (start + MAX_WORDS >= words.length) break;
  }
  return chunks;
}

// Same reasoning as lib/knowledge's ingest: one insert per batch, not one for the whole file —
// a large seed file can produce many chunks, and a single request for all of them risks
// PostgREST's request size limit.
const CHUNK_INSERT_BATCH_SIZE = 200;

async function main() {
  const [publicKey, filePath, titleArg] = process.argv.slice(2);
  if (!publicKey || !filePath) {
    console.error("Usage: pnpm seed-knowledge <publicKey> <path-to-text-file> [title]");
    process.exit(1);
  }

  const service = createServiceClient();
  const project = unwrap(await service.from("projects").select("id, name").eq("public_key", publicKey).maybeSingle());
  if (!project) {
    console.error(`No project with public key ${publicKey}`);
    process.exit(1);
  }

  const content = readFileSync(filePath, "utf-8");
  const chunks = chunkText(content);
  if (chunks.length === 0) {
    console.error(`${filePath} has no text to chunk`);
    process.exit(1);
  }

  // Embed before writing anything, so a failed embedding call leaves no partial source behind.
  const embeddings = await embedTexts(chunks);

  const title = titleArg ?? basename(filePath);
  const source = unwrapRow(
    await service
      .from("knowledge_sources")
      .insert({ project_id: project.id, title, type: "text", status: "processing" })
      .select("id")
      .single(),
  );

  try {
    for (let start = 0; start < chunks.length; start += CHUNK_INSERT_BATCH_SIZE) {
      const batch = chunks.slice(start, start + CHUNK_INSERT_BATCH_SIZE).map((chunkContent, i) => ({
        project_id: project.id,
        source_id: source.id,
        content: chunkContent,
        // pgvector columns are typed as `string` (the generator has no TS type for `vector`); JSON's
        // array syntax is also pgvector's text input syntax.
        embedding: JSON.stringify(embeddings[start + i]!),
      }));
      unwrap(await service.from("knowledge_chunks").insert(batch));
    }
    unwrap(await service.from("knowledge_sources").update({ status: "ready" }).eq("id", source.id));
  } catch (error) {
    // Leaves no `ready` source with zero (or partial) chunks: remove it instead.
    const { error: deleteError } = await service.from("knowledge_sources").delete().eq("id", source.id);
    if (deleteError) console.error(`Could not remove the failed source ${source.id}; it's stuck processing`, deleteError);
    throw error;
  }

  console.log(`Seeded ${chunks.length} chunks for "${project.name}" from ${filePath} (source ${source.id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
