import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_MODEL, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@askwell/shared";

// "server-only" throws outside a React Server Components build; stub it.
// The OpenAI SDK is mocked: no network, no key needed.
vi.mock("server-only", () => ({}));
const embeddingsCreate = vi.fn();
const chatCreate = vi.fn();
const constructorOptions: unknown[] = [];
vi.mock("openai", () => ({
  default: class {
    embeddings = { create: embeddingsCreate };
    chat = { completions: { create: chatCreate } };
    constructor(options: unknown) {
      constructorOptions.push(options);
    }
  },
}));

const { embedTexts, chatCompletion, EMBEDDING_BATCH_SIZE, OpenAIResponseError } =
  await import("./openai");
const { MissingEnvError } = await import("../supabase/env");

/** A fake embeddings response: one vector per input, tagged with its index. */
function embeddingsFor(input: string[], dims = EMBEDDING_DIMENSIONS) {
  return {
    data: input.map((_, index) => ({ index, embedding: Array<number>(dims).fill(index / 10) })),
  };
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  constructorOptions.length = 0;
  embeddingsCreate.mockReset();
  chatCreate.mockReset();
  embeddingsCreate.mockImplementation(async ({ input }: { input: string[] }) =>
    embeddingsFor(input),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("embedTexts", () => {
  it("returns one 1536-number vector for one text", async () => {
    const vectors = await embedTexts(["hello"]);

    expect(vectors).toHaveLength(1);
    expect(vectors[0]).toHaveLength(1536);
    expect(embeddingsCreate).toHaveBeenCalledWith({
      model: EMBEDDING_MODEL,
      input: ["hello"],
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: "float",
    });
  });

  it("reads the key at call time", async () => {
    await embedTexts(["hello"]);
    expect(constructorOptions[0]).toMatchObject({ apiKey: "sk-test" });
  });

  it("makes no request for no texts", async () => {
    expect(await embedTexts([])).toEqual([]);
    expect(embeddingsCreate).not.toHaveBeenCalled();
  });

  it("batches and keeps input order", async () => {
    const texts = Array.from({ length: EMBEDDING_BATCH_SIZE * 2 + 5 }, (_, i) => `t${i}`);
    const vectors = await embedTexts(texts);

    expect(embeddingsCreate).toHaveBeenCalledTimes(3);
    expect(embeddingsCreate.mock.calls.map(([body]) => body.input.length)).toEqual([
      EMBEDDING_BATCH_SIZE,
      EMBEDDING_BATCH_SIZE,
      5,
    ]);
    expect(vectors).toHaveLength(texts.length);
  });

  it("orders vectors by the index the API returns", async () => {
    embeddingsCreate.mockResolvedValueOnce({
      data: [
        { index: 1, embedding: Array<number>(EMBEDDING_DIMENSIONS).fill(1) },
        { index: 0, embedding: Array<number>(EMBEDDING_DIMENSIONS).fill(0) },
      ],
    });
    const [first, second] = await embedTexts(["a", "b"]);
    expect(first?.[0]).toBe(0);
    expect(second?.[0]).toBe(1);
  });

  it("rejects a vector with the wrong size", async () => {
    embeddingsCreate.mockResolvedValueOnce(embeddingsFor(["a"], 3));
    await expect(embedTexts(["a"])).rejects.toBeInstanceOf(OpenAIResponseError);
  });

  it("rejects duplicate indices", async () => {
    const vector = Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    embeddingsCreate.mockResolvedValueOnce({
      data: [
        { index: 0, embedding: vector },
        { index: 0, embedding: vector },
      ],
    });
    await expect(embedTexts(["a", "b"])).rejects.toThrow(/appears twice/);
  });

  it("rejects out-of-range indices", async () => {
    const vector = Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    embeddingsCreate.mockResolvedValueOnce({ data: [{ index: 1, embedding: vector }] });
    await expect(embedTexts(["a"])).rejects.toThrow(/out of range/);
    embeddingsCreate.mockResolvedValueOnce({ data: [{ index: -1, embedding: vector }] });
    await expect(embedTexts(["a"])).rejects.toThrow(/out of range/);
  });

  it("rejects a missing vector", async () => {
    embeddingsCreate.mockResolvedValueOnce({ data: [] });
    await expect(embedTexts(["a"])).rejects.toBeInstanceOf(OpenAIResponseError);
  });

  it("fails clearly without a key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(embedTexts(["a"])).rejects.toBeInstanceOf(MissingEnvError);
  });
});

describe("chatCompletion", () => {
  it("returns the reply text, model, tokens and latency", async () => {
    chatCreate.mockResolvedValueOnce({
      model: "gpt-5-mini-2025-08-07",
      choices: [{ message: { role: "assistant", content: "  We open at 9.  " } }],
      usage: { prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 },
    });

    const result = await chatCompletion({
      system: "Answer only from the chunks.",
      messages: [{ role: "user", content: "When do you open?" }],
    });

    expect(result.text).toBe("We open at 9.");
    expect(result.model).toBe("gpt-5-mini-2025-08-07");
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 8, totalTokens: 128 });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(chatCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: "Answer only from the chunks." },
          { role: "user", content: "When do you open?" },
        ],
      }),
    );
  });

  it("returns empty text and zero tokens when the API omits them", async () => {
    chatCreate.mockResolvedValueOnce({
      model: CHAT_MODEL,
      choices: [{ message: { role: "assistant", content: null } }],
    });

    const result = await chatCompletion({ system: "s", messages: [] });
    expect(result.text).toBe("");
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  });

  it("passes API errors through", async () => {
    chatCreate.mockRejectedValueOnce(new Error("rate limited"));
    await expect(chatCompletion({ system: "s", messages: [] })).rejects.toThrow("rate limited");
  });
});

describe("module", () => {
  it("is server only and never reads the key from a public variable", () => {
    const source = readFileSync(new URL("./openai.ts", import.meta.url), "utf8");
    expect(source).toMatch(/^import "server-only";$/m);
    expect(source).not.toMatch(/NEXT_PUBLIC_/);
  });
});
