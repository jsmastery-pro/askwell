// AI settings shared by knowledge ingest (Lane A) and chat (Lane B). project.md §3, §6.4, §6.6.

export const AI_MODELS = {
  // Proposed in P3-T01; the product owner confirms in review.
  chat: "gpt-5.4-mini",
  embedding: "text-embedding-3-small",
} as const;

/** Must match `knowledge_chunks.embedding vector(1536)` (P1-T01). */
export const EMBEDDING_DIMENSIONS = 1536;

export const CHUNKING = { maxTokens: 800, overlapTokens: 100 } as const;

/** Chunks retrieved per question (§6.6 step 3). */
export const RETRIEVAL_TOP_K = 5;

/** The exact reply when the knowledge doesn't cover a question (§6.6 step 4). */
export const DONT_KNOW_REPLY = "I don't know the answer to that based on the information I have.";
