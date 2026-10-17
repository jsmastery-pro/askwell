// @vitest-environment node
import { accounts, knowledgeChunks, knowledgeSources, projects } from "@askwell/db";
import type { KnowledgeSource } from "@askwell/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../../lib/widget-config/test-db";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ db: undefined as unknown, userId: null as string | null }));
vi.mock("@askwell/db/client", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));

const deleteKnowledgeFile = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/storage", () => ({ deleteKnowledgeFile }));

const { DELETE } = await import("./route");

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
});

afterAll(() => close());

beforeEach(() => {
  state.userId = null;
  deleteKnowledgeFile.mockReset();
  deleteKnowledgeFile.mockResolvedValue(undefined);
});

const as = (userId: string | null) => {
  state.userId = userId;
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("https://app.test/api/knowledge/x", { method: "DELETE" });

async function seedProjectWithSource(
  ownerId: string,
  publicKey: string,
  source: { type: KnowledgeSource["type"]; storageKey: string | null },
) {
  await db.insert(accounts).values({ clerkUserId: ownerId, plan: "free" }).onConflictDoNothing();
  const [project] = await db.insert(projects).values({ ownerId, name: "Docs", publicKey }).returning();
  const [row] = await db
    .insert(knowledgeSources)
    .values({ projectId: project!.id, title: "Doc", type: source.type, storageKey: source.storageKey, status: "ready" })
    .returning();
  return { projectId: project!.id, source: row! };
}

describe("unauthenticated", () => {
  it("returns 401", async () => {
    const res = await DELETE(req(), ctx("00000000-0000-4000-8000-000000000000"));
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/knowledge/:id", () => {
  it("returns 404 for an unknown id", async () => {
    as("owner_unknown");
    const res = await DELETE(req(), ctx("00000000-0000-4000-8000-000000000000"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for a malformed id", async () => {
    as("owner_unknown");
    const res = await DELETE(req(), ctx("not-a-uuid"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for another owner's source, without deleting it", async () => {
    const { source } = await seedProjectWithSource("owner_a", "pk_del_a", { type: "text", storageKey: null });
    as("owner_b");

    const res = await DELETE(req(), ctx(source.id));

    expect(res.status).toBe(404);
    const rows = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(rows).toHaveLength(1);
  });

  it("deletes a pasted-text source (no storage object) and its row", async () => {
    const { source } = await seedProjectWithSource("owner_text", "pk_del_text", { type: "text", storageKey: null });
    as("owner_text");

    const res = await DELETE(req(), ctx(source.id));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteKnowledgeFile).not.toHaveBeenCalled();
    const rows = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(rows).toHaveLength(0);
  });

  it("deletes a file source's storage object, row, and chunks", async () => {
    const { projectId, source } = await seedProjectWithSource("owner_file", "pk_del_file", {
      type: "pdf",
      storageKey: `projects/x/${crypto.randomUUID()}`,
    });
    await db.insert(knowledgeChunks).values({
      projectId,
      sourceId: source.id,
      content: "chunk",
      embedding: Array(1536).fill(0.1),
    });
    as("owner_file");

    const res = await DELETE(req(), ctx(source.id));

    expect(res.status).toBe(200);
    expect(deleteKnowledgeFile).toHaveBeenCalledWith(source.storageKey);
    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, source.id));
    expect(chunks).toHaveLength(0);
  });

  it("still deletes the row when the storage delete fails", async () => {
    const { source } = await seedProjectWithSource("owner_storagefail", "pk_del_fail", {
      type: "pdf",
      storageKey: "projects/x/gone",
    });
    deleteKnowledgeFile.mockRejectedValueOnce(new Error("not found in storage"));
    as("owner_storagefail");

    const res = await DELETE(req(), ctx(source.id));

    expect(res.status).toBe(200);
    const rows = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id));
    expect(rows).toHaveLength(0);
  });
});
