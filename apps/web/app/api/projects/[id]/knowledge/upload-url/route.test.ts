// @vitest-environment node
import { accounts, knowledgeSources, projects } from "@askwell/db";
import { eq } from "drizzle-orm";
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

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc }) }));

const createKnowledgeUploadUrl = vi.hoisted(() => vi.fn());
const deleteKnowledgeFile = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/storage", () => ({
  createKnowledgeUploadUrl,
  deleteKnowledgeFile,
  knowledgeFileKey: (projectId: string, sourceId: string) => `projects/${projectId}/${sourceId}`,
}));

const { POST } = await import("./route");

type ReserveArgs = {
  p_project_id: string;
  p_title: string;
  p_type: string;
  p_storage_key: string;
  p_source_limit: number;
  p_source_id: string;
};
const reserveArgs = () => rpc.mock.calls[0]![1] as ReserveArgs;

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
});

afterAll(() => close());

function rpcRow(overrides: Partial<{ id: string; title: string; type: string; status: string; created_at: string }> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "doc.pdf",
    type: "pdf",
    status: "processing",
    created_at: "2026-10-27T10:00:00+00:00",
    ...overrides,
  };
}

beforeEach(() => {
  state.userId = null;
  rpc.mockReset();
  rpc.mockResolvedValue({ data: rpcRow(), error: null });
  createKnowledgeUploadUrl.mockReset();
  createKnowledgeUploadUrl.mockResolvedValue({ path: "projects/p/s", token: "tok" });
  deleteKnowledgeFile.mockReset();
  deleteKnowledgeFile.mockResolvedValue(undefined);
});

const as = (userId: string | null) => {
  state.userId = userId;
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedProject(ownerId: string, plan: "free" | "pro", publicKey: string) {
  await db.insert(accounts).values({ clerkUserId: ownerId, plan }).onConflictDoNothing();
  const [project] = await db.insert(projects).values({ ownerId, name: "Docs", publicKey }).returning();
  return project!.id;
}

function request(body: unknown) {
  return new Request("https://app.test/api/projects/x/knowledge/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("unauthenticated", () => {
  it("returns 401", async () => {
    const res = await POST(request({ fileName: "a.pdf", size: 100 }), ctx("any"));
    expect(res.status).toBe(401);
  });
});

describe("tenant isolation", () => {
  it("returns 404 for another owner's project", async () => {
    const projectId = await seedProject("owner_a", "free", "pk_a1");
    as("owner_b");
    const res = await POST(request({ fileName: "a.pdf", size: 100 }), ctx(projectId));
    expect(res.status).toBe(404);
  });
});

describe("validation", () => {
  it("rejects an unsupported extension with 400, before reserving anything", async () => {
    const projectId = await seedProject("owner_ext", "free", "pk_ext");
    as("owner_ext");
    const res = await POST(request({ fileName: "virus.exe", size: 100 }), ctx(projectId));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a declared size over the limit with 413, before reserving anything", async () => {
    const projectId = await seedProject("owner_size", "free", "pk_size");
    as("owner_size");
    const res = await POST(request({ fileName: "big.pdf", size: 11 * 1024 * 1024 }), ctx(projectId));
    expect(res.status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("success", () => {
  it("reserves the source, signs an upload URL, and returns both", async () => {
    const projectId = await seedProject("owner_ok", "free", "pk_ok");
    as("owner_ok");

    const res = await POST(request({ fileName: "doc.pdf", size: 1000, title: "My title" }), ctx(projectId));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      source: { id: rpcRow().id, title: "doc.pdf", type: "pdf", status: "processing" },
      path: "projects/p/s",
      token: "tok",
    });

    const args = reserveArgs();
    expect(args).toMatchObject({
      p_project_id: projectId,
      p_title: "My title",
      p_type: "pdf",
      p_source_limit: 3,
    });
    expect(args.p_storage_key).toBe(`projects/${projectId}/${args.p_source_id}`);
    expect(createKnowledgeUploadUrl).toHaveBeenCalledWith(args.p_storage_key);
  });

  it("falls back to the file name when no title is given", async () => {
    const projectId = await seedProject("owner_notitle", "free", "pk_notitle");
    as("owner_notitle");
    await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    const args = reserveArgs();
    expect(args.p_title).toBe("doc.pdf");
  });
});

describe("reserve_knowledge_source refusals", () => {
  it("maps AWLIM to 403 plan_limit", async () => {
    const projectId = await seedProject("owner_awlim", "free", "pk_awlim");
    as("owner_awlim");
    rpc.mockResolvedValue({ data: null, error: { code: "AWLIM", message: "limit reached" } });

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("plan_limit");
    expect(createKnowledgeUploadUrl).not.toHaveBeenCalled();
  });

  it("maps AWNOP to 404", async () => {
    const projectId = await seedProject("owner_awnop", "free", "pk_awnop");
    as("owner_awnop");
    rpc.mockResolvedValue({ data: null, error: { code: "AWNOP", message: "not found" } });

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    expect(res.status).toBe(404);
  });

  it("maps an unexpected error to 500", async () => {
    const projectId = await seedProject("owner_unexpected", "free", "pk_unexpected");
    as("owner_unexpected");
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { code: "XXXXX", message: "boom" } });

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    expect(res.status).toBe(500);
  });
});

describe("signing failure", () => {
  it("frees the reserved slot with 500 when signing the upload URL fails", async () => {
    const projectId = await seedProject("owner_signfail", "free", "pk_signfail");
    as("owner_signfail");
    vi.spyOn(console, "error").mockImplementation(() => {});
    createKnowledgeUploadUrl.mockRejectedValue(new Error("storage down"));

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    expect(res.status).toBe(500);

    const args = reserveArgs();
    const rows = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, args.p_source_id));
    expect(rows).toHaveLength(0);
  });
});

describe("abandoned reservations", () => {
  it("reclaims a project's own stale processing reservation before counting against the limit", async () => {
    const projectId = await seedProject("owner_stale", "free", "pk_stale");
    as("owner_stale");
    const old = new Date(Date.now() - 1000 * 60 * 60 * 3); // 3h ago, past the 2h reclaim threshold
    const [stale] = await db
      .insert(knowledgeSources)
      .values({ projectId, title: "abandoned", type: "pdf", status: "processing", storageKey: "projects/p/old", createdAt: old })
      .returning();

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    expect(res.status).toBe(201);

    const remaining = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, stale!.id));
    expect(remaining).toHaveLength(0);
    expect(deleteKnowledgeFile).toHaveBeenCalledWith("projects/p/old");
  });

  it("leaves a recent processing reservation alone", async () => {
    const projectId = await seedProject("owner_recent", "free", "pk_recent");
    as("owner_recent");
    const [recent] = await db
      .insert(knowledgeSources)
      .values({ projectId, title: "in flight", type: "pdf", status: "processing", storageKey: "projects/p/recent" })
      .returning();

    await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));

    const stillThere = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, recent!.id));
    expect(stillThere).toHaveLength(1);
  });
});
