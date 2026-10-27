// @vitest-environment node
import { accounts, knowledgeChunks, knowledgeSources, projects } from "@askwell/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../widget-config/test-db";

vi.mock("server-only", () => ({}));

const embedTexts = vi.hoisted(() => vi.fn());
vi.mock("../ai", () => ({ embedTexts }));

// getKnowledgeSourceById, deleteKnowledgeSource and processKnowledgeSource now run through the
// service client (SB-T07). This fake proxies straight through to the same pglite db
// listProjectKnowledgeSources/countProjectKnowledgeSources (still Drizzle) read and write, so a
// row these functions touch is visible to Drizzle assertions, and vice versa.
function toRawRow(row: typeof knowledgeSources.$inferSelect) {
  return {
    id: row.id,
    project_id: row.projectId,
    title: row.title,
    type: row.type,
    storage_key: row.storageKey,
    status: row.status,
    created_at: row.createdAt.toISOString(),
  };
}

function from(table: string) {
  if (table === "knowledge_sources") {
    return {
      select: () => ({
        eq: (_c: string, id: string) => ({
          maybeSingle: async () => {
            const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, id));
            return { data: row ? toRawRow(row) : null, error: null };
          },
        }),
      }),
      update: (values: { status: "ready" | "failed" }) => ({
        eq: async (_c: string, id: string) => {
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
      insert: async (rows: { project_id: string; source_id: string; content: string; embedding: number[] }[]) => {
        await db
          .insert(knowledgeChunks)
          .values(rows.map((r) => ({ projectId: r.project_id, sourceId: r.source_id, content: r.content, embedding: r.embedding })));
        return { error: null };
      },
    };
  }
  throw new Error(`unexpected table ${table}`);
}
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from }) }));

const {
  countProjectKnowledgeSources,
  deleteKnowledgeSource,
  getKnowledgeSourceById,
  listProjectKnowledgeSources,
  processKnowledgeSource,
  toKnowledgeSource,
} = await import("./index");

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
});

describe("toKnowledgeSource", () => {
  it("maps a row to the public shape", async () => {
    const source = await insertSource({ title: "Pasted" });
    expect(toKnowledgeSource(source)).toEqual({
      id: source.id,
      title: "Pasted",
      type: "text",
      status: "processing",
      createdAt: source.createdAt.toISOString(),
    });
  });
});

describe("countProjectKnowledgeSources", () => {
  it("counts every source, pasted text included", async () => {
    const otherProject = (
      await db.insert(projects).values({ ownerId: "owner_1", name: "Other", publicKey: "pk_other" }).returning()
    )[0]!;
    await db.insert(knowledgeSources).values([
      { projectId: otherProject.id, title: "t", type: "text" },
      { projectId: otherProject.id, title: "f1", type: "pdf", storageKey: "k1" },
      { projectId: otherProject.id, title: "f2", type: "md", storageKey: "k2" },
    ]);

    expect(await countProjectKnowledgeSources(otherProject.id, db)).toBe(3);
  });
});

describe("listProjectKnowledgeSources", () => {
  it("returns a project's sources, newest first", async () => {
    const otherProject = (
      await db.insert(projects).values({ ownerId: "owner_1", name: "List", publicKey: "pk_list" }).returning()
    )[0]!;
    // Explicit, distinct timestamps: two inserts can land in the same instant, which would
    // make the ordering this test checks for ambiguous.
    const [first, second] = await db
      .insert(knowledgeSources)
      .values([
        { projectId: otherProject.id, title: "First", type: "text", createdAt: new Date("2026-01-01T00:00:00.000Z") },
        { projectId: otherProject.id, title: "Second", type: "pdf", storageKey: "k", createdAt: new Date("2026-01-02T00:00:00.000Z") },
      ])
      .returning();

    const sources = await listProjectKnowledgeSources(otherProject.id, db);

    expect(sources.map((s) => s.id)).toEqual([second!.id, first!.id]);
  });

  it("returns nothing for a project with no sources", async () => {
    const empty = (
      await db.insert(projects).values({ ownerId: "owner_1", name: "Empty", publicKey: "pk_empty" }).returning()
    )[0]!;
    expect(await listProjectKnowledgeSources(empty.id, db)).toEqual([]);
  });
});

describe("getKnowledgeSourceById", () => {
  it("returns the row for a known id", async () => {
    const source = await insertSource({ title: "Findable" });
    expect((await getKnowledgeSourceById(source.id))?.id).toBe(source.id);
  });

  it("returns null for an unknown or malformed id", async () => {
    expect(await getKnowledgeSourceById("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getKnowledgeSourceById("not-a-uuid")).toBeNull();
  });
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
});

describe("deleteKnowledgeSource", () => {
  it("removes the row only, freeing the file slot it reserved (the object is the caller's job)", async () => {
    const source = await insertSource({ title: "Upload failed", type: "pdf", storageKey: "k" });
    const countBefore = await countProjectKnowledgeSources(projectId, db);

    await deleteKnowledgeSource(source.id);

    const rows = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(rows).toHaveLength(0);
    expect(await countProjectKnowledgeSources(projectId, db)).toBe(countBefore - 1);
  });

  it("cascades to the source's chunks", async () => {
    const source = await insertSource({ title: "With chunks" });
    await db.insert(knowledgeChunks).values({ projectId, sourceId: source.id, content: "x", embedding: Array(1536).fill(0.1) });

    await deleteKnowledgeSource(source.id);

    expect(await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, source.id))).toHaveLength(0);
  });
});
