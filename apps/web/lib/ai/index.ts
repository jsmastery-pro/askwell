// Server-only: importing this from a client component fails the build, so the key never ships.
import "server-only";
import { AI_MODELS, EMBEDDING_DIMENSIONS } from "@askwell/shared";
import OpenAI from "openai";

/** Inputs per embeddings request. 100 × 800-token chunks stays well under OpenAI's per-request token cap. */
export const EMBED_BATCH_SIZE = 100;

// Embeddings are small, fast calls — this budget applies to every embeddings request (the chat
// route's single query and the knowledge route's per-batch ingest alike). Worst case with one
// retry: 2 × 4s + ~0.5s backoff ≈ 8.5s. The chat route (lib/chat/answer.ts) budgets its own
// completion call on top of this, since it has the smaller maxDuration budget of the two.
const EMBED_TIMEOUT_MS = 4_000;
const EMBED_MAX_RETRIES = 1;

let client: OpenAI | undefined;

/** The shared OpenAI client. Throws on first use, not at import, if the key is missing. */
export function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    client = new OpenAI({ apiKey, timeout: EMBED_TIMEOUT_MS, maxRetries: EMBED_MAX_RETRIES });
  }
  return client;
}

function assertDimensions(vector: number[]): number[] {
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected a ${EMBEDDING_DIMENSIONS}-dimension embedding, got ${vector.length}`);
  }
  return vector;
}

/** Embeds texts in batches. Returns one vector per input, in input order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    const response = await getOpenAI().embeddings.create({
      model: AI_MODELS.embedding,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    if (response.data.length !== batch.length) {
      throw new Error(`Expected ${batch.length} embeddings, got ${response.data.length}`);
    }
    // Order by the returned index rather than trusting response order.
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    vectors.push(...ordered.map((item) => assertDimensions(item.embedding)));
  }
  return vectors;
}

/** Embeds a single visitor question for retrieval. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector!;
}
