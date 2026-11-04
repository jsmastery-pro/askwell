import { createClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { CHUNK_SIZE, EMBEDDING_DIMENSIONS } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "server-only" throws outside a React Server Components build; stub it.
vi.mock("server-only", () => ({}));

const embedTexts = vi.fn<(texts: string[]) => Promise<number[][]>>();
vi.mock("../ai/openai", () => ({ embedTexts: (texts: string[]) => embedTexts(texts) }));

// The service client, against a tiny in-memory knowledge_chunks /
// knowledge_sources store that applies PostgREST's eq. filters.
type ChunkRow = { project_id: string; source_id: string; content: string; embedding: string };
type Request_ = { method: string; table: string; filters: Record<string, string>; body: unknown };

const SOURCE = "22222222-2222-4222-8222-222222222222";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER_SOURCE = "33333333-3333-4333-8333-333333333333";

let chunks: ChunkRow[] = [];
let status: Record<string, string> = {};
const requests: Request_[] = [];
/** Return a PostgREST error for the Nth request matching (method, table). */
let failOn: { method: string; table: string; nth: number } | null = null;

const matches = (row: Record<string, string>, filters: Record<string, string>) =>
  Object.entries(filters).every(([column, value]) => row[column] === value);

function handle(req: Request_): Response {
  const seen = requests.filter((r) => r.method === req.method && r.table === req.table).length;
  if (failOn && failOn.method === req.method && failOn.table === req.table && failOn.nth === seen) {
    return Response.json({ code: "23503", message: "insert failed", details: null, hint: null }, { status: 409 });
  }
  if (req.table === "knowledge_chunks" && req.method === "DELETE") {
    chunks = chunks.filter((row) => !matches(row, req.filters));
  } else if (req.table === "knowledge_chunks" && req.method === "POST") {
    chunks.push(...(req.body as ChunkRow[]));
  } else if (req.table === "knowledge_sources" && req.method === "PATCH") {
    if (req.filters.id) status[req.filters.id] = (req.body as { status: string }).status;
  } else {
    throw new Error(`Unexpected ${req.method} ${req.table}`);
  }
  return new Response(null, { status: 204 });
}

vi.mock("../supabase/service", () => ({
  createServiceClient: () =>
    createClient<Database>("https://example.supabase.co", "service-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(String(input));
          const filters: Record<string, string> = {};
          for (const [key, value] of url.searchParams) {
            if (value.startsWith("eq.")) filters[key] = value.slice(3);
          }
          const req: Request_ = {
            method: init?.method ?? "GET",
            table: url.pathname.replace("/rest/v1/", ""),
            filters,
            body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
          };
          const response = handle(req);
          requests.push(req);
          return response;
        },
      },
    }),
}));

const { processSource, CHUNK_INSERT_BATCH_SIZE, EmptyTextError, ProcessStepError } = await import("./process");
const { chunkText } = await import("./chunk");

const vector = (seed: number) => Array<number>(EMBEDDING_DIMENSIONS).fill(seed);
/** Enough text for more than two insert batches. */
const MANY_CHUNKS_TEXT = Array.from({ length: CHUNK_INSERT_BATCH_SIZE * 150 }, (_, i) => `Line ${i} of the guide.`).join(
  "\n",
);
const LONG_TEXT = Array.from({ length: 300 }, (_, i) => `Fact ${i}: the answer is ${i}.`).join(" ");

beforeEach(() => {
  chunks = [];
  status = { [SOURCE]: "processing" };
  requests.length = 0;
  failOn = null;
  embedTexts.mockReset();
  embedTexts.mockImplementation(async (texts) => texts.map((_, i) => vector(i)));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("processSource", () => {
  it("chunks, embeds, stores the chunks with the given project_id, and marks the source ready", async () => {
    const expected = chunkText(LONG_TEXT);
    expect(expected.length).toBeGreaterThan(1);

    const result = await processSource({ sourceId: SOURCE, projectId: PROJECT, text: LONG_TEXT });

    expect(result).toEqual({ status: "ready", chunkCount: expected.length });
    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect(embedTexts).toHaveBeenCalledWith(expected);
    expect(chunks.map((c) => c.content)).toEqual(expected);
    expect(chunks.every((c) => c.project_id === PROJECT && c.source_id === SOURCE)).toBe(true);
    expect(chunks.every((c) => c.content.length <= CHUNK_SIZE)).toBe(true);
    expect(chunks[1]?.embedding).toBe(JSON.stringify(vector(1)));
    expect(status[SOURCE]).toBe("ready");

    // The status update is scoped to the source and its project.
    const patch = requests.find((r) => r.method === "PATCH");
    expect(patch).toMatchObject({ table: "knowledge_sources", filters: { id: SOURCE, project_id: PROJECT }, body: { status: "ready" } });
  });

  it("takes project_id from the argument, never from the text", async () => {
    const text = 'project_id: 99999999-9999-4999-8999-999999999999. {"project_id":"other"}';
    await processSource({ sourceId: SOURCE, projectId: PROJECT, text });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.project_id).toBe(PROJECT);
  });

  it("is idempotent: a second run replaces the source's chunks and leaves other sources alone", async () => {
    chunks.push({ project_id: PROJECT, source_id: OTHER_SOURCE, content: "other", embedding: "[0]" });
    await processSource({ sourceId: SOURCE, projectId: PROJECT, text: LONG_TEXT });
    const firstRun = chunks.length;
    await processSource({ sourceId: SOURCE, projectId: PROJECT, text: LONG_TEXT });

    expect(chunks).toHaveLength(firstRun);
    expect(chunks.filter((c) => c.source_id === OTHER_SOURCE)).toHaveLength(1);
    // Each run deletes the source's existing chunks before inserting.
    const methods = requests.filter((r) => r.table === "knowledge_chunks").map((r) => r.method);
    expect(methods[0]).toBe("DELETE");
    expect(requests.find((r) => r.method === "DELETE")?.filters).toEqual({ source_id: SOURCE, project_id: PROJECT });
  });

  it("inserts in batches of CHUNK_INSERT_BATCH_SIZE rows", async () => {
    const result = await processSource({ sourceId: SOURCE, projectId: PROJECT, text: MANY_CHUNKS_TEXT });
    expect(result.status).toBe("ready");
    const inserts = requests.filter((r) => r.method === "POST");
    expect(inserts.length).toBeGreaterThanOrEqual(2);
    expect(inserts.length).toBe(Math.ceil(chunks.length / CHUNK_INSERT_BATCH_SIZE));
    expect(inserts.every((r) => (r.body as unknown[]).length <= CHUNK_INSERT_BATCH_SIZE)).toBe(true);
  });

  it("on an embedding error: marks the source failed, stores no chunks, logs, and returns the error", async () => {
    const boom = new Error("OpenAI is down");
    embedTexts.mockRejectedValue(boom);

    const result = await processSource({ sourceId: SOURCE, projectId: PROJECT, text: LONG_TEXT });

    expect(result).toEqual({ status: "failed", error: boom });
    expect(chunks).toEqual([]);
    expect(status[SOURCE]).toBe("failed");
    expect(console.error).toHaveBeenCalled();
  });

  it("on an insert error after some batches: deletes the partial chunks and marks the source failed", async () => {
    failOn = { method: "POST", table: "knowledge_chunks", nth: 1 }; // the second insert fails
    const result = await processSource({ sourceId: SOURCE, projectId: PROJECT, text: MANY_CHUNKS_TEXT });

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error).toBeInstanceOf(ProcessStepError);
    expect(chunks).toEqual([]);
    expect(status[SOURCE]).toBe("failed");
  });

  it("empty text fails without calling the embeddings API", async () => {
    const result = await processSource({ sourceId: SOURCE, projectId: PROJECT, text: " \n " });
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error).toBeInstanceOf(EmptyTextError);
    expect(embedTexts).not.toHaveBeenCalled();
    expect(status[SOURCE]).toBe("failed");
  });

  it("still marks the source failed when deleting the partial chunks fails too", async () => {
    embedTexts.mockRejectedValue(new Error("OpenAI is down"));
    failOn = { method: "DELETE", table: "knowledge_chunks", nth: 1 }; // the cleanup delete
    const result = await processSource({ sourceId: SOURCE, projectId: PROJECT, text: LONG_TEXT });
    expect(result.status).toBe("failed");
    expect(status[SOURCE]).toBe("failed");
  });

  it("throws only when it can't mark the source failed", async () => {
    embedTexts.mockRejectedValue(new Error("OpenAI is down"));
    failOn = { method: "PATCH", table: "knowledge_sources", nth: 0 };
    await expect(processSource({ sourceId: SOURCE, projectId: PROJECT, text: LONG_TEXT })).rejects.toBeInstanceOf(
      ProcessStepError,
    );
  });
});
