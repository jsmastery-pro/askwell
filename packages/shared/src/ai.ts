// AI settings shared by knowledge processing and chat (project.md §3, §6.4, §6.6).

/** The chat model that answers visitor questions. */
export const CHAT_MODEL = "gpt-5-mini";

/** The embedding model for knowledge chunks and questions. */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Vector size of EMBEDDING_MODEL. Must match the pgvector column. */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Target chunk length, in characters. ~1,500 characters is ~350–400 tokens:
 * big enough to hold a full paragraph or FAQ answer with its context, small
 * enough that MATCH_COUNT chunks (~2,000 tokens) keep the chat prompt cheap
 * and each embedding focused on one topic.
 */
export const CHUNK_SIZE = 1500;

/**
 * Characters shared by neighbouring chunks (~13% of CHUNK_SIZE), so a sentence
 * cut at a boundary still appears whole in one of the two chunks.
 */
export const CHUNK_OVERLAP = 200;

/** Chunks retrieved per question (`match_chunks`). */
export const MATCH_COUNT = 5;

/**
 * Cosine similarity below which a chunk doesn't count as a match. With
 * text-embedding-3-small, related text usually scores ~0.35–0.7 and unrelated
 * text ~0.05–0.25, so 0.3 drops noise while keeping loosely worded questions.
 * A starting value: tune it on real questions once chat is live.
 */
export const MIN_MATCH_SIMILARITY = 0.3;

/** Public chat rate limit: 20 messages per minute per public key + IP (Arcjet). */
export const CHAT_RATE_LIMIT = { max: 20, windowSeconds: 60 } as const;

/** An `uploading` reservation not finalized within 2 hours is reclaimed. */
export const UPLOAD_RESERVATION_TTL_MS = 2 * 60 * 60 * 1000;

/** The exact reply the bot sends when the knowledge doesn't answer the question. */
export const IDK_REPLY =
  "I don't know the answer to that based on the information I have. Try rephrasing your question, or contact the team directly.";
