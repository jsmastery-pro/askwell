// The one OpenAI client: embeddings for knowledge + questions, and the chat
// reply (project.md §3, §6.4, §6.6).
//
// Server only: OPENAI_API_KEY is a secret (§11). It's read at call time, so a
// missing key fails the call with a clear error instead of failing the build.
import "server-only";
import OpenAI from "openai";
import { CHAT_MODEL, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@askwell/shared";
import { requireEnv } from "../supabase/env";

/**
 * Texts per embeddings request. The API takes up to 2,048 inputs and 300k
 * tokens per request; 100 chunks of CHUNK_SIZE characters is ~40k tokens.
 */
export const EMBEDDING_BATCH_SIZE = 100;

/** Give up on one OpenAI request after 30 s (the SDK retries twice first). */
const REQUEST_TIMEOUT_MS = 30_000;

/** A new client with the current key. Cheap: it holds no connection. */
function openai(): OpenAI {
  return new OpenAI({
    apiKey: requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY),
    timeout: REQUEST_TIMEOUT_MS,
  });
}

/** The API returned something we can't use. */
export class OpenAIResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIResponseError";
  }
}

/**
 * One EMBEDDING_DIMENSIONS-number vector per text, in input order. Sends
 * EMBEDDING_BATCH_SIZE texts per request, one request at a time.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = openai();
  const vectors: number[][] = [];

  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: "float",
    });

    if (response.data.length !== batch.length) {
      throw new OpenAIResponseError(
        `Expected ${batch.length} embeddings, got ${response.data.length}.`,
      );
    }
    // The API tags each vector with its input index; don't rely on order. Each
    // index must name a distinct input, or a vector could land on the wrong chunk.
    const ordered: number[][] = [];
    for (const { index, embedding } of response.data) {
      if (!Number.isInteger(index) || index < 0 || index >= batch.length) {
        throw new OpenAIResponseError(`Embedding index ${index} is out of range.`);
      }
      if (ordered[index] !== undefined) {
        throw new OpenAIResponseError(`Embedding index ${index} appears twice.`);
      }
      ordered[index] = embedding;
    }
    for (const embedding of ordered) {
      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new OpenAIResponseError(
          `Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}.`,
        );
      }
      vectors.push(embedding);
    }
  }

  return vectors;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatCompletionResult = {
  /** The reply, trimmed. Empty when the model returned no text. */
  text: string;
  /** The model that answered, as OpenAI reports it (e.g. a dated snapshot). */
  model: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  /** Wall time of the request, retries included. */
  latencyMs: number;
};

/**
 * One CHAT_MODEL reply to `messages` under the `system` prompt. Returns the
 * text plus what Phase 4's AI trace needs: model, tokens and latency.
 */
export async function chatCompletion({
  system,
  messages,
}: {
  system: string;
  messages: ChatMessage[];
}): Promise<ChatCompletionResult> {
  const client = openai();
  const startedAt = performance.now();

  const completion = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [{ role: "system", content: system }, ...messages],
    // Short support answers from given chunks don't need deep reasoning;
    // low effort keeps the widget's reply fast.
    reasoning_effort: "low",
  });

  const latencyMs = Math.round(performance.now() - startedAt);
  const usage = completion.usage;

  return {
    text: completion.choices[0]?.message.content?.trim() ?? "",
    model: completion.model,
    usage: {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
    latencyMs,
  };
}
