// @vitest-environment node
import { accounts, knowledgeChunks, knowledgeSources, projects } from "@askwell/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../widget-config/test-db";

vi.mock("server-only", () => ({}));

const embedTexts = vi.hoisted(() => vi.fn());
vi.mock("../ai", () => ({ embedTexts }));

// deleteKnowledgeSource and processKnowledgeSource run through the service client (SB-T07). This
// fake proxies straight through to the same pglite db this file's own Drizzle asserts read and
// write, so a row they touch is visible here, and vice versa.
const fake = vi.hoisted(() => ({ failedUpdateError: null as { message: string } | null }));

function from(table: string) {
  if (table === "knowledge_sources") {
    return {
      update: (values: { status: "ready" | "failed" }) => ({
        eq: async (_c: string, id: string) => {
          if (values.status === "failed" && fake.failedUpdateError) return { error: fake.failedUpdateError };
          await db.update(knowledgeSources).set({ status: values.status }).where(eq(knowledgeSources.id, id));
          return { error: null };
        },
      }),
      delete: () => ({
        eq: async (_c: string, id: string) => {
          await db.delete(knowledgeSources).where(eq(knowledgeSources.id, id));
          return { error: null };
        },
      }),
    };
  }
  if (table === "knowledge_chunks") {
    return {
      // The real client sends embeddings as pgvector's text form (JSON.stringify'd); parse them
      // back to number[] for Drizzle, which wants the array itself.
      insert: async (rows: { project_id: string; source_id: string; content: string; embedding: string }[]) => {
        await db
          .insert(knowledgeChunks)
          .values(
            rows.map((r) => ({
              projectId: r.project_id,
              sourceId: r.source_id,
              content: r.content,
              embedding: JSON.parse(r.embedding) as number[],
            })),
          );
        return { error: null };
      },
    };
  }
  throw new Error(`unexpected table ${table}`);
}
vi.mock("../supabase/service", () => ({ createServiceClient: () => ({ from }) }));

const { deleteKnowledgeSource, processKnowledgeSource } = await import("./index");

let db: TestDb;
let close: () => Promise<void>;
let projectId: string;

async function insertSource(overrides: Partial<typeof knowledgeSources.$inferInsert> = {}) {
  const [row] = await db
    .insert(knowledgeSources)
    .values({ projectId, title: "Source", type: "text", status: "processing", ...overrides })
    .returning();
  return row!;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(accounts).values({ clerkUserId: "owner_1", plan: "free" });
  const [project] = await db
    .insert(projects)
    .values({ ownerId: "owner_1", name: "Docs", publicKey: "pk_test" })
    .returning();
  projectId = project!.id;
});

afterAll(() => close());

afterEach(() => {
  embedTexts.mockReset();
  fake.failedUpdateError = null;
});

describe("processKnowledgeSource", () => {
  it("chunks, embeds, stores chunks, and sets the source ready", async () => {
    const source = await insertSource({ title: "Ready" });
    embedTexts.mockResolvedValue([Array(1536).fill(0.1)]);

    await processKnowledgeSource(source.id, projectId, () => "Some content about the product.");

    const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(row?.status).toBe("ready");
    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, source.id));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("Some content about the product.");
  });

  it("inserts chunks in more than one batch when there are more than one batch's worth", async () => {
    const source = await insertSource({ title: "Big" });
    // One chunk per call, so a long text produces many chunks without needing a real multi-MB input.
    const words = Array.from({ length: 450 * 600 }, (_, i) => `word${i}`).join(" ");
    embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => Array(1536).fill(0.1)));

    await processKnowledgeSource(source.id, projectId, () => words);

    const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(row?.status).toBe("ready");
    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, source.id));
    expect(chunks.length).toBeGreaterThan(200);
  });

  it("sets the source failed when there's no extractable text", async () => {
    const source = await insertSource({ title: "Empty" });

    await processKnowledgeSource(source.id, projectId, () => "   ");

    const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(row?.status).toBe("failed");
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it("sets the source failed when extraction throws", async () => {
    const source = await insertSource({ title: "Bad", type: "pdf", storageKey: "k" });

    await processKnowledgeSource(source.id, projectId, () => {
      throw new Error("corrupt file");
    });

    const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(row?.status).toBe("failed");
  });

  it("sets the source failed when embedding throws", async () => {
    const source = await insertSource({ title: "Fails" });
    embedTexts.mockRejectedValue(new Error("OpenAI is down"));

    await processKnowledgeSource(source.id, projectId, () => "Some content.");

    const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(row?.status).toBe("failed");
  });

  it("never throws when marking the source failed itself fails", async () => {
    const source = await insertSource({ title: "Doubly broken" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.failedUpdateError = { message: "db down" };

    await expect(processKnowledgeSource(source.id, projectId, () => "   ")).resolves.toBeUndefined();

    // Runs after the response (after()/runAfterResponse): nothing is left to catch a throw here.
    const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(row?.status).toBe("processing");
  });
});

describe("deleteKnowledgeSource", () => {
  it("removes the row only, freeing the file slot it reserved (the object is the caller's job)", async () => {
    const source = await insertSource({ title: "Upload failed", type: "pdf", storageKey: "k" });
    const countBefore = (await db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId))).length;

    await deleteKnowledgeSource(source.id);

    const rows = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(rows).toHaveLength(0);
    expect((await db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId))).length).toBe(countBefore - 1);
  });

  it("cascades to the source's chunks", async () => {
    const source = await insertSource({ title: "With chunks" });
    await db.insert(knowledgeChunks).values({ projectId, sourceId: source.id, content: "x", embedding: Array(1536).fill(0.1) });

    await deleteKnowledgeSource(source.id);

    expect(await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, source.id))).toHaveLength(0);
  });
});
