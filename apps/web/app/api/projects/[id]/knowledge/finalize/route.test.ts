// @vitest-environment node
import { accounts, knowledgeChunks, knowledgeSources, projects } from "@askwell/db";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "../../../../../../lib/supabase/fake";
import { createTestDb, type TestDb } from "../../../../../../lib/widget-config/test-db";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ db: undefined as unknown, userId: null as string | null, owner: undefined as unknown }));
vi.mock("@askwell/db/client", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));
// Ownership (lib/projects) reads through the owner client (RLS); which rows RLS lets an owner see
// is tested against the real migrations on pglite (packages/db), so here another owner's project
// is simply a row the fake doesn't return.
vi.mock("../../../../../../lib/supabase/owner", () => ({ createOwnerClient: () => state.owner }));

const embedTexts = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/ai", () => ({ embedTexts }));

const captureServerEvent = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/posthog/server", () => ({ captureServerEvent }));

const readKnowledgeFile = vi.hoisted(() => vi.fn());
const deleteKnowledgeFile = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/storage", () => ({ readKnowledgeFile, deleteKnowledgeFile }));

// deleteKnowledgeSource is still Drizzle-backed on this branch (SB-T07 moves it to the service
// client); a spy that calls through to the real implementation by default lets one test (refuse's
// delete-failure path) make it throw without touching the others, which rely on it really deleting
// the row.
const deleteKnowledgeSource = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/knowledge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../../lib/knowledge")>();
  return { ...actual, deleteKnowledgeSource };
});
const actualDeleteKnowledgeSource = (
  await vi.importActual<typeof import("../../../../../../lib/knowledge")>("../../../../../../lib/knowledge")
).deleteKnowledgeSource;

// The claim and revert steps are tested directly against this fake; the status updates and chunk
// inserts that follow (processKnowledgeSource, deleteKnowledgeSource — SB-T07, also on the service
// client) proxy straight through to the same pglite db this file's own Drizzle asserts read, so a
// row they touch is visible here and vice versa.
type ClaimRow = { id: string; title: string; type: string; storage_key: string; status: string; created_at: string };
const fake = vi.hoisted(() => ({
  claimResult: { data: null as ClaimRow | null, error: null as { message: string } | null },
  existingResult: { data: null as { type: string } | null, error: null as { message: string } | null },
  revertEq: vi.fn(async () => ({ data: null, error: null })),
}));

// processKnowledgeSource and deleteKnowledgeSource (lib/knowledge, SB-T07) now go through this
// same fake too: their knowledge_sources status updates and the row delete proxy straight
// through to the real pglite db, so Drizzle asserts below see their effects; knowledge_chunks
// does the same for the batched insert.
function from(table: string) {
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
  if (table !== "knowledge_sources") throw new Error(`unexpected table ${table}`);
  return {
    update(values: { status: "processing" | "uploading" | "ready" | "failed" }) {
      if (values.status === "processing") {
        // The atomic claim: processing only from uploading, once.
        return { eq: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => fake.claimResult }) }) }) }) };
      }
      if (values.status === "uploading") {
        // The best-effort revert on a storage-read failure: fire-and-forget, no select after it.
        return { eq: () => ({ eq: fake.revertEq }) };
      }
      // ready/failed: processKnowledgeSource's real status update, proxied to the real pglite row.
      const status = values.status as "ready" | "failed";
      return {
        eq: async (_column: string, id: string) => {
          await db.update(knowledgeSources).set({ status }).where(eq(knowledgeSources.id, id));
          return { error: null };
        },
      };
    },
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => fake.existingResult }) }) }),
    delete: () => ({
      eq: async (_column: string, id: string) => {
        await db.delete(knowledgeSources).where(eq(knowledgeSources.id, id));
        return { error: null };
      },
    }),
  };
}
vi.mock("../../../../../../lib/supabase/service", () => ({ createServiceClient: () => ({ from }) }));

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
  state.owner = undefined;
  captureServerEvent.mockClear();
  readKnowledgeFile.mockReset();
  deleteKnowledgeFile.mockReset();
  deleteKnowledgeFile.mockResolvedValue(undefined);
  embedTexts.mockReset();
  embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => Array(1536).fill(0.1)));
  fake.claimResult = { data: null, error: null };
  fake.existingResult = { data: null, error: null };
  fake.revertEq.mockClear();
  deleteKnowledgeSource.mockReset();
  deleteKnowledgeSource.mockImplementation(actualDeleteKnowledgeSource);
});

/** Signs in `userId`, with an owner client that sees `projectId` as theirs (null: another owner's). */
function signIn(userId: string, projectId: string | null) {
  state.userId = userId;
  state.owner = fakeSupabase({ from: { projects: { data: projectId && { id: projectId } } } });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedProject(ownerId: string, publicKey: string) {
  await db.insert(accounts).values({ clerkUserId: ownerId, plan: "free" }).onConflictDoNothing();
  const [project] = await db.insert(projects).values({ ownerId, name: "Docs", publicKey }).returning();
  return project!.id;
}

async function seedSource(projectId: string, overrides: Partial<typeof knowledgeSources.$inferInsert> = {}) {
  const [source] = await db
    .insert(knowledgeSources)
    .values({ projectId, title: "doc.pdf", type: "pdf", status: "processing", storageKey: "projects/p/s", ...overrides })
    .returning();
  return source!;
}

/** Arms a successful claim with the real seeded row's fields, so ids line up with Drizzle asserts. */
function claimable(source: Awaited<ReturnType<typeof seedSource>>) {
  fake.claimResult = {
    data: {
      id: source.id,
      title: source.title,
      type: source.type,
      storage_key: source.storageKey!,
      status: "processing",
      created_at: source.createdAt.toISOString(),
    },
    error: null,
  };
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
    signIn("owner_b", null);
    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(404);
  });
});

describe("not found", () => {
  it("returns 404 for an unknown source id", async () => {
    const projectId = await seedProject("owner_unknown", "pk_unknown");
    signIn("owner_unknown", projectId);
    const res = await POST(request("00000000-0000-4000-8000-0000000000ff"), ctx(projectId));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the source belongs to a different project", async () => {
    const projectId = await seedProject("owner_mismatch", "pk_mismatch");
    const otherProjectId = await seedProject("owner_mismatch2", "pk_mismatch2");
    const source = await seedSource(otherProjectId);
    signIn("owner_mismatch", projectId);
    // Not claimable (wrong project), and the fallback lookup is scoped to this project too, so it
    // finds nothing — same as an unknown id.
    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(404);
  });

  it("returns 404 for a pasted-text source (no file to finalize)", async () => {
    const projectId = await seedProject("owner_text", "pk_text");
    const source = await seedSource(projectId, { type: "text", storageKey: null });
    signIn("owner_text", projectId);
    fake.existingResult = { data: { type: "text" }, error: null };
    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(404);
  });
});

describe("already finalized", () => {
  it("rejects finalizing a source that isn't `uploading` any more", async () => {
    const projectId = await seedProject("owner_done", "pk_done");
    const source = await seedSource(projectId, { status: "ready" });
    signIn("owner_done", projectId);
    fake.existingResult = { data: { type: "pdf" }, error: null };
    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(400);
  });
});

describe("success", () => {
  it("accepts a real PDF, starts processing, and fires knowledge_added", async () => {
    const projectId = await seedProject("owner_ok", "pk_ok");
    const source = await seedSource(projectId, { title: "handbook.pdf" });
    signIn("owner_ok", projectId);
    claimable(source);
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
    signIn("owner_txt", projectId);
    claimable(source);
    readKnowledgeFile.mockResolvedValue(Buffer.from("Some notes."));

    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(201);
  });
});

describe("refusals clean up the row and the object", () => {
  it("rejects and cleans up an empty object", async () => {
    const projectId = await seedProject("owner_empty", "pk_empty");
    const source = await seedSource(projectId);
    signIn("owner_empty", projectId);
    claimable(source);
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
    signIn("owner_big", projectId);
    claimable(source);
    readKnowledgeFile.mockResolvedValue(Buffer.alloc(11 * 1024 * 1024));

    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(413);
    expect(await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id))).toHaveLength(0);
  });

  it("rejects and cleans up a fake PDF (wrong magic bytes)", async () => {
    const projectId = await seedProject("owner_fake", "pk_fake");
    const source = await seedSource(projectId);
    signIn("owner_fake", projectId);
    claimable(source);
    readKnowledgeFile.mockResolvedValue(Buffer.from("not a real pdf"));

    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(400);
    expect(await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id))).toHaveLength(0);
    expect(deleteKnowledgeFile).toHaveBeenCalledWith("projects/p/s");
  });

  it("hands the row back to `uploading` and returns 500 when the row delete itself fails", async () => {
    const projectId = await seedProject("owner_delfail", "pk_delfail");
    const source = await seedSource(projectId);
    signIn("owner_delfail", projectId);
    claimable(source);
    vi.spyOn(console, "error").mockImplementation(() => {});
    readKnowledgeFile.mockResolvedValue(Buffer.alloc(0));
    deleteKnowledgeSource.mockRejectedValueOnce(new Error("db down"));

    const res = await POST(request(source.id), ctx(projectId));

    expect(res.status).toBe(500);
    // The row is untouched (never reached the real pglite delete) and the object is never removed.
    expect(await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id))).toHaveLength(1);
    expect(deleteKnowledgeFile).not.toHaveBeenCalled();
    expect(fake.revertEq).toHaveBeenCalledWith("status", "processing");
  });
});

describe("storage read failure", () => {
  it("returns 400, keeps the source for a retry, and hands `uploading` back", async () => {
    const projectId = await seedProject("owner_readfail", "pk_readfail");
    const source = await seedSource(projectId);
    signIn("owner_readfail", projectId);
    claimable(source);
    vi.spyOn(console, "error").mockImplementation(() => {});
    readKnowledgeFile.mockRejectedValue(new Error("object not found"));

    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(400);
    expect(await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id))).toHaveLength(1);
    expect(deleteKnowledgeFile).not.toHaveBeenCalled();
    expect(fake.revertEq).toHaveBeenCalledWith("status", "processing");
  });
});
