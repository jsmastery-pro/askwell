import { describe, expect, it } from "vitest";
import {
  CHAT_MODEL,
  CHAT_RATE_LIMIT,
  CHUNK_OVERLAP,
  CONFIG_RATE_LIMIT,
  CHUNK_SIZE,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  IDK_REPLY,
  MATCH_COUNT,
  MIN_MATCH_SIMILARITY,
  UPLOAD_RESERVATION_TTL_MS,
} from "./index";

describe("AI settings", () => {
  it("match project.md", () => {
    expect(CHAT_MODEL).toBe("gpt-5-mini");
    expect(EMBEDDING_MODEL).toBe("text-embedding-3-small");
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
    expect(MATCH_COUNT).toBe(5);
    expect(CHAT_RATE_LIMIT).toEqual({ max: 20, windowSeconds: 60 });
    expect(CONFIG_RATE_LIMIT).toEqual({ max: 60, windowSeconds: 60 });
    expect(UPLOAD_RESERVATION_TTL_MS).toBe(2 * 60 * 60 * 1000);
  });

  it("chunks with an overlap smaller than the chunk", () => {
    expect(CHUNK_SIZE).toBeGreaterThan(0);
    expect(CHUNK_OVERLAP).toBeGreaterThanOrEqual(0);
    expect(CHUNK_OVERLAP).toBeLessThan(CHUNK_SIZE / 2);
  });

  it("has a cosine similarity threshold between 0 and 1", () => {
    expect(MIN_MATCH_SIMILARITY).toBeGreaterThan(0);
    expect(MIN_MATCH_SIMILARITY).toBeLessThan(1);
  });

  it("says it doesn't know", () => {
    expect(IDK_REPLY).toMatch(/^I don't know/);
  });
});
