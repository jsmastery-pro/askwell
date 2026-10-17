// @vitest-environment node
import { accounts, knowledgeChunks, knowledgeSources, projects } from "@askwell/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../widget-config/test-db";

vi.mock("server-only", () => ({}));

const embedTexts = vi.hoisted(() => vi.fn());
vi.mock("../ai", () => ({ embedTexts }));

const {
  countProjectKnowledgeFiles,
  deleteKnowledgeSource,
  insertKnowledgeSource,
  processKnowledgeSource,
  toKnowledgeSource,
} = await import("./index");

let db: TestDb;
let close: () => Promise<void>;
let projectId: string;

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
    const source = await insertKnowledgeSource({ projectId, title: "Pasted", type: "text", storageKey: null }, db);
    expect(toKnowledgeSource(source)).toEqual({
      id: source.id,
      title: "Pasted",
      type: "text",
      status: "processing",
      createdAt: source.createdAt.toISOString(),
    });
  });
});

describe("insertKnowledgeSource", () => {
  it("defaults to a fresh id and `processing` status", async () => {
    const source = await insertKnowledgeSource({ projectId, title: "A", type: "text", storageKey: null }, db);
    expect(source.status).toBe("processing");
  });

  it("accepts a pre-generated id, so the caller can derive the storage key first", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const source = await insertKnowledgeSource(
      { id, projectId, title: "File", type: "pdf", storageKey: `projects/${projectId}/${id}` },
      db,
    );
    expect(source.id).toBe(id);
    expect(source.storageKey).toBe(`projects/${projectId}/${id}`);
  });
});

describe("countProjectKnowledgeFiles", () => {
  it("counts file sources but not pasted text", async () => {
    const otherProject = (
      await db.insert(projects).values({ ownerId: "owner_1", name: "Other", publicKey: "pk_other" }).returning()
    )[0]!;
    await insertKnowledgeSource({ projectId: otherProject.id, title: "t", type: "text", storageKey: null }, db);
    await insertKnowledgeSource({ projectId: otherProject.id, title: "f1", type: "pdf", storageKey: "k1" }, db);
    await insertKnowledgeSource({ projectId: otherProject.id, title: "f2", type: "md", storageKey: "k2" }, db);

    expect(await countProjectKnowledgeFiles(otherProject.id, db)).toBe(2);
  });
});

describe("processKnowledgeSource", () => {
  it("chunks, embeds, stores chunks, and sets the source ready", async () => {
    const source = await insertKnowledgeSource({ projectId, title: "Ready", type: "text", storageKey: null }, db);
    embedTexts.mockResolvedValue([Array(1536).fill(0.1)]);

    await processKnowledgeSource(source.id, projectId, () => "Some content about the product.", db);

    const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(row?.status).toBe("ready");
    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, source.id));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("Some content about the product.");
  });

  it("sets the source failed when there's no extractable text", async () => {
    const source = await insertKnowledgeSource({ projectId, title: "Empty", type: "text", storageKey: null }, db);

    await processKnowledgeSource(source.id, projectId, () => "   ", db);

    const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(row?.status).toBe("failed");
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it("sets the source failed when extraction throws", async () => {
    const source = await insertKnowledgeSource({ projectId, title: "Bad", type: "pdf", storageKey: "k" }, db);

    await processKnowledgeSource(
      source.id,
      projectId,
      () => {
        throw new Error("corrupt file");
      },
      db,
    );

    const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(row?.status).toBe("failed");
  });

  it("sets the source failed when embedding throws", async () => {
    const source = await insertKnowledgeSource({ projectId, title: "Fails", type: "text", storageKey: null }, db);
    embedTexts.mockRejectedValue(new Error("OpenAI is down"));

    await processKnowledgeSource(source.id, projectId, () => "Some content.", db);

    const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(row?.status).toBe("failed");
  });
});

describe("deleteKnowledgeSource", () => {
  it("removes the row, freeing the file slot it reserved", async () => {
    const source = await insertKnowledgeSource({ projectId, title: "Upload failed", type: "pdf", storageKey: "k" }, db);
    expect(await countProjectKnowledgeFiles(projectId, db)).toBeGreaterThan(0);
    const countBefore = await countProjectKnowledgeFiles(projectId, db);

    await deleteKnowledgeSource(source.id, db);

    const rows = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(rows).toHaveLength(0);
    expect(await countProjectKnowledgeFiles(projectId, db)).toBe(countBefore - 1);
  });
});
