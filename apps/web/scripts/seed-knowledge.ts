#!/usr/bin/env -S pnpm exec tsx --conditions=react-server
// Dev tool: seeds a project with real knowledge chunks, so the chat route (P3-T05) can be
// tested before Lane A's upload pipeline (P3-T02) exists. Never run this against `main`.
//
// Usage:
//   pnpm seed-knowledge <publicKey> <path-to-text-file> [title]
//
// Reads DATABASE_URL and OPENAI_API_KEY from .env.local (falls back to .env), same as `next dev`.

import { knowledgeChunks, knowledgeSources, projects } from "@askwell/db";
import { db } from "@askwell/db/client";
import { CHUNKING } from "@askwell/shared";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { embedTexts } from "../lib/ai";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
    break;
  } catch {
    // Try the next candidate; it's fine if neither exists (env may already be set).
  }
}

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

  const title = titleArg ?? basename(filePath);
  const [source] = await db
    .insert(knowledgeSources)
    .values({ projectId: project.id, title, type: "text", status: "ready" })
    .returning();

  const embeddings = await embedTexts(chunks);
  await db.insert(knowledgeChunks).values(
    chunks.map((chunkContent, i) => ({
      projectId: project.id,
      sourceId: source!.id,
      content: chunkContent,
      embedding: embeddings[i]!,
    })),
  );

  console.log(`Seeded ${chunks.length} chunks for "${project.name}" from ${filePath} (source ${source!.id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
