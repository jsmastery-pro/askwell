// @vitest-environment node
import { createSupabaseTestDb } from "@askwell/db/supabase-pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const embedTexts = vi.hoisted(() => vi.fn());
vi.mock("../ai", () => ({ embedTexts }));

// deleteKnowledgeSource and processKnowledgeSource run through the service client (SB-T07). This
// fake proxies straight through to a pglite db with the real Supabase migrations, which this
// file's own SQL asserts read and write, so a row they touch is visible here, and vice versa.
const fake = vi.hoisted(() => ({
  failedUpdateError: null as { message: string } | null,
  // 1-based chunk-insert call to fail (no rows inserted that call), to test a later batch failing.
  failChunkBatch: null as number | null,
  chunkInsertCalls: 0,
}));

function from(table: string) {
  if (table === "knowledge_sources") {
    return {
      update: (values: { status: "ready" | "failed" }) => ({
        eq: async (_c: string, id: string) => {
          if (values.status === "failed" && fake.failedUpdateError) return { error: fake.failedUpdateError };
          await db.query("UPDATE public.knowledge_sources SET status = $1 WHERE id = $2", [values.status, id]);
          return { error: null };
        },
      }),
      delete: () => ({
        eq: async (_c: string, id: string) => {
          await db.query("DELETE FROM public.knowledge_sources WHERE id = $1", [id]);
          return { error: null };
        },
      }),
    };
  }
  if (table === "knowledge_chunks") {
    return {
      // The real client sends embeddings as pgvector's text form (JSON.stringify'd), which is
      // what the vector cast reads here too.
      insert: async (rows: { project_id: string; source_id: string; content: string; embedding: string }[]) => {
        fake.chunkInsertCalls += 1;
        if (fake.failChunkBatch === fake.chunkInsertCalls) return { error: { message: "insert failed" } };
        await insertChunks(rows);
        return { error: null };
      },
      delete: () => ({
        eq: async (_c: string, sourceId: string) => {
          await db.query("DELETE FROM public.knowledge_chunks WHERE source_id = $1", [sourceId]);
          return { error: null };
        },
      }),
    };
  }
  throw new Error(`unexpected table ${table}`);
}
vi.mock("../supabase/service", () => ({ createServiceClient: () => ({ from }) }));

const { deleteKnowledgeSource, processKnowledgeSource } = await import("./index");

// Hundreds of 1536-dim chunks into the real HNSW index take a few seconds on pglite: close to
// Vitest's 5s default once the rest of the suite runs alongside.
const LARGE_INPUT_TIMEOUT_MS = 20_000;

let db: Awaited<ReturnType<typeof createSupabaseTestDb>>;
let projectId: string;

type SourceRow = { id: string; status: string };

async function insertSource(overrides: { title?: string; type?: string; storage_key?: string } = {}) {
  const { title = "Source", type = "text", storage_key = null } = overrides;
  const { rows } = await db.query<SourceRow>(
    `INSERT INTO public.knowledge_sources (project_id, title, type, storage_key, status)
     VALUES ($1, $2, $3, $4, 'processing') RETURNING id, status`,
    [projectId, title, type, storage_key],
  );
  return rows[0]!;
}

async function insertChunks(rows: { project_id: string; source_id: string; content: string; embedding: string }[]) {
  await db.query(
    `INSERT INTO public.knowledge_chunks (project_id, source_id, content, embedding)
     SELECT r.project_id, r.source_id, r.content, r.embedding::extensions.vector
     FROM jsonb_to_recordset($1::jsonb) AS r(project_id uuid, source_id uuid, content text, embedding text)`,
    [JSON.stringify(rows)],
  );
}

async function sourceStatus(id: string) {
  const { rows } = await db.query<SourceRow>("SELECT id, status FROM public.knowledge_sources WHERE id = $1", [id]);
  return rows[0]?.status;
}

async function chunksOf(sourceId: string) {
  const { rows } = await db.query<{ content: string }>("SELECT content FROM public.knowledge_chunks WHERE source_id = $1", [sourceId]);
  return rows;
}

async function sourceCount() {
  const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.knowledge_sources WHERE project_id = $1", [projectId]);
  return rows[0]!.n;
}

beforeAll(async () => {
  db = await createSupabaseTestDb();
  await db.query("INSERT INTO public.accounts (clerk_user_id, plan) VALUES ('owner_1', 'free')");
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO public.projects (owner_id, name, public_key) VALUES ('owner_1', 'Docs', 'pk_test') RETURNING id",
  );
  projectId = rows[0]!.id;
});

afterAll(() => db.close());

afterEach(() => {
  embedTexts.mockReset();
  fake.failedUpdateError = null;
  fake.failChunkBatch = null;
  fake.chunkInsertCalls = 0;
});

describe("processKnowledgeSource", () => {
  it("chunks, embeds, stores chunks, and sets the source ready", async () => {
    const source = await insertSource({ title: "Ready" });
    embedTexts.mockResolvedValue([Array(1536).fill(0.1)]);

    await processKnowledgeSource(source.id, projectId, () => "Some content about the product.");

    expect(await sourceStatus(source.id)).toBe("ready");
    const chunks = await chunksOf(source.id);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("Some content about the product.");
  });

  it("inserts chunks in more than one batch when there are more than one batch's worth", async () => {
    const source = await insertSource({ title: "Big" });
    // One chunk per call, so a long text produces many chunks without needing a real multi-MB input.
    const words = Array.from({ length: 450 * 600 }, (_, i) => `word${i}`).join(" ");
    embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => Array(1536).fill(0.1)));

    await processKnowledgeSource(source.id, projectId, () => words);

    expect(await sourceStatus(source.id)).toBe("ready");
    const chunks = await chunksOf(source.id);
    expect(chunks.length).toBeGreaterThan(200);
  }, LARGE_INPUT_TIMEOUT_MS);

  it("sets the source failed when there's no extractable text", async () => {
    const source = await insertSource({ title: "Empty" });

    await processKnowledgeSource(source.id, projectId, () => "   ");

    expect(await sourceStatus(source.id)).toBe("failed");
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it("sets the source failed when extraction throws", async () => {
    const source = await insertSource({ title: "Bad", type: "pdf", storage_key: "k" });

    await processKnowledgeSource(source.id, projectId, () => {
      throw new Error("corrupt file");
    });

    expect(await sourceStatus(source.id)).toBe("failed");
  });

  it("sets the source failed when embedding throws", async () => {
    const source = await insertSource({ title: "Fails" });
    embedTexts.mockRejectedValue(new Error("OpenAI is down"));

    await processKnowledgeSource(source.id, projectId, () => "Some content.");

    expect(await sourceStatus(source.id)).toBe("failed");
  });

  it("deletes already-inserted chunks when a later batch fails", async () => {
    const source = await insertSource({ title: "Partial" });
    // Over 200 chunks (CHUNK_INSERT_BATCH_SIZE): more than one insert call, so the second can fail
    // after the first already landed some rows.
    const words = Array.from({ length: 450 * 600 }, (_, i) => `word${i}`).join(" ");
    embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => Array(1536).fill(0.1)));
    fake.failChunkBatch = 2;
    vi.spyOn(console, "error").mockImplementation(() => {});

    await processKnowledgeSource(source.id, projectId, () => words);

    expect(await sourceStatus(source.id)).toBe("failed");
    expect(await chunksOf(source.id)).toHaveLength(0);
  }, LARGE_INPUT_TIMEOUT_MS);

  it("never throws when marking the source failed itself fails", async () => {
    const source = await insertSource({ title: "Doubly broken" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.failedUpdateError = { message: "db down" };

    await expect(processKnowledgeSource(source.id, projectId, () => "   ")).resolves.toBeUndefined();

    // Runs after the response (after()/runAfterResponse): nothing is left to catch a throw here.
    expect(await sourceStatus(source.id)).toBe("processing");
  });
});

describe("deleteKnowledgeSource", () => {
  it("removes the row only, freeing the file slot it reserved (the object is the caller's job)", async () => {
    const source = await insertSource({ title: "Upload failed", type: "pdf", storage_key: "k" });
    const countBefore = await sourceCount();

    await deleteKnowledgeSource(source.id);

    expect(await sourceStatus(source.id)).toBeUndefined();
    expect(await sourceCount()).toBe(countBefore - 1);
  });

  it("cascades to the source's chunks", async () => {
    const source = await insertSource({ title: "With chunks" });
    await insertChunks([{ project_id: projectId, source_id: source.id, content: "x", embedding: JSON.stringify(Array(1536).fill(0.1)) }]);

    await deleteKnowledgeSource(source.id);

    expect(await chunksOf(source.id)).toHaveLength(0);
  });
});
