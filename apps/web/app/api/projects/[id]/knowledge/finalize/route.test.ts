// @vitest-environment node
import { accounts, knowledgeChunks, knowledgeSources, projects } from "@askwell/db";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../../../../lib/widget-config/test-db";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ db: undefined as unknown, userId: null as string | null }));
vi.mock("@askwell/db/client", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));

const embedTexts = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/ai", () => ({ embedTexts }));

const captureServerEvent = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/posthog/server", () => ({ captureServerEvent }));

const readKnowledgeFile = vi.hoisted(() => vi.fn());
const deleteKnowledgeFile = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/storage", () => ({ readKnowledgeFile, deleteKnowledgeFile }));

const { POST } = await import("./route");

const samplePdf = readFileSync(fileURLToPath(new URL("../../../../../../lib/knowledge/fixtures/sample.pdf", import.meta.url)));

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
});

afterAll(() => close());

beforeEach(() => {
  state.userId = null;
  captureServerEvent.mockClear();
  readKnowledgeFile.mockReset();
  deleteKnowledgeFile.mockReset();
  deleteKnowledgeFile.mockResolvedValue(undefined);
  embedTexts.mockReset();
  embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => Array(1536).fill(0.1)));
});

const as = (userId: string | null) => {
  state.userId = userId;
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedProject(ownerId: string, publicKey: string) {
  await db.insert(accounts).values({ clerkUserId: ownerId, plan: "free" }).onConflictDoNothing();
  const [project] = await db.insert(projects).values({ ownerId, name: "Docs", publicKey }).returning();
  return project!.id;
}

async function seedSource(
  projectId: string,
  overrides: Partial<typeof knowledgeSources.$inferInsert> = {},
) {
  const [source] = await db
    .insert(knowledgeSources)
    .values({ projectId, title: "doc.pdf", type: "pdf", status: "processing", storageKey: "projects/p/s", ...overrides })
    .returning();
  return source!;
}

function request(sourceId: string) {
  return new Request("https://app.test/api/projects/x/knowledge/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId }),
  });
}

describe("unauthenticated", () => {
  it("returns 401", async () => {
    const res = await POST(request("00000000-0000-4000-8000-000000000001"), ctx("any"));
    expect(res.status).toBe(401);
  });
});

describe("tenant isolation", () => {
  it("returns 404 for another owner's project", async () => {
    const projectId = await seedProject("owner_a", "pk_a1");
    const source = await seedSource(projectId);
    as("owner_b");
    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(404);
  });
});

describe("not found", () => {
  it("returns 404 for an unknown source id", async () => {
    const projectId = await seedProject("owner_unknown", "pk_unknown");
    as("owner_unknown");
    const res = await POST(request("00000000-0000-4000-8000-0000000000ff"), ctx(projectId));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the source belongs to a different project", async () => {
    const projectId = await seedProject("owner_mismatch", "pk_mismatch");
    const otherProjectId = await seedProject("owner_mismatch2", "pk_mismatch2");
    const source = await seedSource(otherProjectId);
    as("owner_mismatch");
    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(404);
  });

  it("returns 404 for a pasted-text source (no file to finalize)", async () => {
    const projectId = await seedProject("owner_text", "pk_text");
    const source = await seedSource(projectId, { type: "text", storageKey: null });
    as("owner_text");
    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(404);
  });
});

describe("already finalized", () => {
  it("rejects finalizing a source that isn't processing any more", async () => {
    const projectId = await seedProject("owner_done", "pk_done");
    const source = await seedSource(projectId, { status: "ready" });
    as("owner_done");
    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(400);
  });
});

describe("success", () => {
  it("accepts a real PDF, starts processing, and fires knowledge_added", async () => {
    const projectId = await seedProject("owner_ok", "pk_ok");
    const source = await seedSource(projectId, { title: "handbook.pdf" });
    as("owner_ok");
    readKnowledgeFile.mockResolvedValue(samplePdf);

    const res = await POST(request(source.id), ctx(projectId));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.source).toMatchObject({ id: source.id, title: "handbook.pdf", type: "pdf" });
    expect(captureServerEvent).toHaveBeenCalledExactlyOnceWith("owner_ok", "knowledge_added", {
      project_id: projectId,
      type: "pdf",
    });

    await vi.waitFor(async () => {
      const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
      expect(row?.status).toBe("ready");
    });
    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, source.id));
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("accepts a plain text file (md/txt skip the PDF magic-byte check)", async () => {
    const projectId = await seedProject("owner_txt", "pk_txt");
    const source = await seedSource(projectId, { type: "txt", title: "notes.txt" });
    as("owner_txt");
    readKnowledgeFile.mockResolvedValue(Buffer.from("Some notes."));

    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(201);
  });
});

describe("refusals clean up the row and the object", () => {
  it("rejects and cleans up an empty object", async () => {
    const projectId = await seedProject("owner_empty", "pk_empty");
    const source = await seedSource(projectId);
    as("owner_empty");
    readKnowledgeFile.mockResolvedValue(Buffer.alloc(0));

    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(400);
    expect(await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id))).toHaveLength(0);
    expect(deleteKnowledgeFile).toHaveBeenCalledWith("projects/p/s");
    expect(captureServerEvent).not.toHaveBeenCalled();
  });

  it("rejects and cleans up an oversized object", async () => {
    const projectId = await seedProject("owner_big", "pk_big");
    const source = await seedSource(projectId);
    as("owner_big");
    readKnowledgeFile.mockResolvedValue(Buffer.alloc(11 * 1024 * 1024));

    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(413);
    expect(await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id))).toHaveLength(0);
  });

  it("rejects and cleans up a fake PDF (wrong magic bytes)", async () => {
    const projectId = await seedProject("owner_fake", "pk_fake");
    const source = await seedSource(projectId);
    as("owner_fake");
    readKnowledgeFile.mockResolvedValue(Buffer.from("not a real pdf"));

    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(400);
    expect(await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id))).toHaveLength(0);
    expect(deleteKnowledgeFile).toHaveBeenCalledWith("projects/p/s");
  });
});

describe("storage read failure", () => {
  it("returns 400 but keeps the source for a retry, since the upload may not have landed yet", async () => {
    const projectId = await seedProject("owner_readfail", "pk_readfail");
    const source = await seedSource(projectId);
    as("owner_readfail");
    vi.spyOn(console, "error").mockImplementation(() => {});
    readKnowledgeFile.mockRejectedValue(new Error("object not found"));

    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(400);
    expect(await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id))).toHaveLength(1);
    expect(deleteKnowledgeFile).not.toHaveBeenCalled();
  });
});
