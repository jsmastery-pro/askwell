import { describe, expect, it } from "vitest";
import { AI_MODELS, CHUNKING, DONT_KNOW_REPLY, EMBEDDING_DIMENSIONS, RETRIEVAL_TOP_K } from "./ai";
import { RATE_LIMITS } from "./rate-limits";

describe("AI settings", () => {
  it("uses text-embedding-3-small at 1536 dimensions (§3, matches the DB column)", () => {
    expect(AI_MODELS.embedding).toBe("text-embedding-3-small");
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });

  it("retrieves the top 5 chunks (§6.6)", () => {
    expect(RETRIEVAL_TOP_K).toBe(5);
  });

  it("chunks at 800 tokens with 100 overlap", () => {
    expect(CHUNKING).toEqual({ maxTokens: 800, overlapTokens: 100 });
    expect(CHUNKING.overlapTokens).toBeLessThan(CHUNKING.maxTokens);
  });

  it("has a non-empty I don't know reply", () => {
    expect(DONT_KNOW_REPLY).toMatch(/I don't know/);
  });
});

describe("RATE_LIMITS", () => {
  it("limits chat to 20 messages per 60 s (§6.6)", () => {
    expect(RATE_LIMITS.widgetChat).toEqual({ windowSeconds: 60, max: 20 });
  });

  it("leaves the config limit unchanged", () => {
    expect(RATE_LIMITS.widgetConfig).toEqual({ windowSeconds: 60, max: 60 });
  });
});
