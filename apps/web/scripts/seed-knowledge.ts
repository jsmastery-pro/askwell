#!/usr/bin/env -S pnpm exec tsx --conditions=react-server
// Dev tool: seeds a project with real knowledge chunks, so the chat route (P3-T05) can be
// tested before Lane A's upload pipeline (P3-T02) exists. Dev only: never run it against production.
//
// Usage:
//   pnpm seed-knowledge <publicKey> <path-to-text-file> [title]
//
// Reads DATABASE_URL (the dev Supabase project's transaction pooler) and OPENAI_API_KEY from
// .env.local / .env, checking this app's own directory first and the repo root second (where
// this monorepo's secrets actually live). DATABASE_CA_CERT, if set, verifies the server's TLS
// certificate. The dev project is shared by everyone, so seeded rows are visible to the team.

import { CHUNKING } from "@askwell/shared";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { embedTexts } from "../lib/ai";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// Earlier files win: loadEnvFile never overwrites a variable that's already set.
for (const file of [".env.local", ".env", join(repoRoot, ".env.local"), join(repoRoot, ".env")]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Fine if a candidate doesn't exist; env may already be set some other way (e.g. exported in the shell).
  }
}

// Imported dynamically, after the env-loading loop above: @askwell/db/client reads
// DATABASE_URL at module load (to construct its pg Pool), so a static import would run
// before .env.local/.env are loaded and could capture an empty connection string.
const { knowledgeChunks, knowledgeSources, projects } = await import("@askwell/db");
const { db } = await import("@askwell/db/client");

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

async function main() {
  const [publicKey, filePath, titleArg] = process.argv.slice(2);
  if (!publicKey || !filePath) {
    console.error("Usage: pnpm seed-knowledge <publicKey> <path-to-text-file> [title]");
    process.exit(1);
  }

  const [project] = await db.select().from(projects).where(eq(projects.publicKey, publicKey)).limit(1);
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

  // Embed before writing anything, then insert the source and its chunks in one transaction —
  // otherwise a failure partway through could leave a `ready` source with zero chunks.
  const embeddings = await embedTexts(chunks);

  const title = titleArg ?? basename(filePath);
  const sourceId = await db.transaction(async (tx) => {
    const [source] = await tx
      .insert(knowledgeSources)
      .values({ projectId: project.id, title, type: "text", status: "ready" })
      .returning();
    await tx.insert(knowledgeChunks).values(
      chunks.map((chunkContent, i) => ({
        projectId: project.id,
        sourceId: source!.id,
        content: chunkContent,
        embedding: embeddings[i]!,
      })),
    );
    return source!.id;
  });

  console.log(`Seeded ${chunks.length} chunks for "${project.name}" from ${filePath} (source ${sourceId})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
