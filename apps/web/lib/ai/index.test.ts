// @vitest-environment node
import { AI_MODELS, EMBEDDING_DIMENSIONS } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const create = vi.hoisted(() => vi.fn());
const constructed = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  default: class {
    embeddings = { create };
    constructor(options: unknown) {
      constructed(options);
    }
  },
}));

const { EMBED_BATCH_SIZE, embedQuery, embedTexts } = await import("./index");

// A distinct, recognisable vector per text: every value is the text's numeric id.
const vectorFor = (text: string, dims = EMBEDDING_DIMENSIONS) => Array(dims).fill(Number(text.replace("t", "")));

function respondInShuffledOrder(dims = EMBEDDING_DIMENSIONS) {
  create.mockImplementation(async ({ input }: { input: string[] }) => ({
    data: input.map((text, index) => ({ index, embedding: vectorFor(text, dims) })).reverse(),
  }));
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
});

afterEach(() => {
  create.mockReset();
  vi.unstubAllEnvs();
});

describe("embedTexts", () => {
  it("batches requests and returns vectors in input order", async () => {
    respondInShuffledOrder();
    const texts = Array.from({ length: EMBED_BATCH_SIZE * 2 + 5 }, (_, i) => `t${i}`);

    const vectors = await embedTexts(texts);

    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls.map(([body]) => body.input.length)).toEqual([EMBED_BATCH_SIZE, EMBED_BATCH_SIZE, 5]);
    expect(create.mock.calls[0]![0]).toMatchObject({ model: AI_MODELS.embedding, dimensions: EMBEDDING_DIMENSIONS });
    expect(vectors.map((v) => v[0])).toEqual(texts.map((_, i) => i));
    // The shared client (constructed once, on this first use): a bounded worst case for the
    // route's maxDuration, not left to OpenAI's 10-minute default / unlimited retries.
    expect(constructed).toHaveBeenCalledWith(expect.objectContaining({ timeout: 5_000, maxRetries: 1 }));
  });

  it("makes no request for an empty list", async () => {
    expect(await embedTexts([])).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it("throws on a wrong dimension", async () => {
    respondInShuffledOrder(512);
    await expect(embedTexts(["t1"])).rejects.toThrow("Expected a 1536-dimension embedding, got 512");
  });

  it("throws if OpenAI returns fewer embeddings than inputs", async () => {
    create.mockResolvedValue({ data: [{ index: 0, embedding: vectorFor("t1") }] });
    await expect(embedTexts(["t1", "t2"])).rejects.toThrow("Expected 2 embeddings, got 1");
  });
});

describe("embedQuery", () => {
  it("returns one 1536-dimension vector", async () => {
    respondInShuffledOrder();
    const vector = await embedQuery("t7");
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(vector[0]).toBe(7);
  });
});

