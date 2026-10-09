// Server-only: importing this from a client component fails the build, so the key never ships.
import "server-only";
import { AI_MODELS, EMBEDDING_DIMENSIONS } from "@askwell/shared";
import OpenAI from "openai";

/** Inputs per embeddings request. 100 × 800-token chunks stays well under OpenAI's per-request token cap. */
export const EMBED_BATCH_SIZE = 100;

let client: OpenAI | undefined;

/** The shared OpenAI client. Throws on first use, not at import, if the key is missing. */
export function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    client = new OpenAI({ apiKey });
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
