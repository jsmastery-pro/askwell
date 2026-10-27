// @vitest-environment node
import { accounts, projects } from "@askwell/db";
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

// A small fake of the two `.from()` chains this route actually uses — not a generic PostgREST
// stand-in. Each terminal method (maybeSingle/lt/eq) resolves the whole chain directly, since
// `await` on a plain (non-thenable) return value just resolves to it.
type Row = Record<string, unknown>;
const fake = vi.hoisted(() => ({
  rpc: vi.fn(),
  accountsResult: { data: null as Row | null, error: null as Row | null },
  staleResult: { data: [] as Row[], error: null as Row | null },
  deleteEq: vi.fn(async () => ({ data: null, error: null })),
}));

function from(table: string) {
  if (table === "accounts") {
    return { select: () => ({ eq: () => ({ maybeSingle: async () => fake.accountsResult }) }) };
  }
  if (table === "knowledge_sources") {
    return {
      select: () => ({ eq: () => ({ eq: () => ({ lt: async () => fake.staleResult }) }) }),
      delete: () => ({ eq: fake.deleteEq }),
    };
  }
  throw new Error(`unexpected table ${table}`);
}
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: fake.rpc, from }) }));

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
const reserveArgs = () => fake.rpc.mock.calls[0]![1] as ReserveArgs;

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
  fake.rpc.mockReset();
  fake.rpc.mockResolvedValue({ data: rpcRow(), error: null });
  fake.accountsResult = { data: { plan: "free" }, error: null };
  fake.staleResult = { data: [], error: null };
  fake.deleteEq.mockClear();
  createKnowledgeUploadUrl.mockReset();
  createKnowledgeUploadUrl.mockResolvedValue({ path: "projects/p/s", token: "tok" });
  deleteKnowledgeFile.mockReset();
  deleteKnowledgeFile.mockResolvedValue(undefined);
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
    const projectId = await seedProject("owner_a", "pk_a1");
    as("owner_b");
    const res = await POST(request({ fileName: "a.pdf", size: 100 }), ctx(projectId));
    expect(res.status).toBe(404);
  });
});

describe("validation", () => {
  it("rejects an unsupported extension with 400, before reserving anything", async () => {
    const projectId = await seedProject("owner_ext", "pk_ext");
    as("owner_ext");
    const res = await POST(request({ fileName: "virus.exe", size: 100 }), ctx(projectId));
    expect(res.status).toBe(400);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("rejects a declared size over the limit with 413, before reserving anything", async () => {
    const projectId = await seedProject("owner_size", "pk_size");
    as("owner_size");
    const res = await POST(request({ fileName: "big.pdf", size: 11 * 1024 * 1024 }), ctx(projectId));
    expect(res.status).toBe(413);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});

describe("success", () => {
  it("reserves the source, signs an upload URL, and returns both", async () => {
    const projectId = await seedProject("owner_ok", "pk_ok");
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
    const projectId = await seedProject("owner_notitle", "pk_notitle");
    as("owner_notitle");
    await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    expect(reserveArgs().p_title).toBe("doc.pdf");
  });

  it("passes the Pro plan's higher source limit", async () => {
    const projectId = await seedProject("owner_pro", "pk_pro");
    as("owner_pro");
    fake.accountsResult = { data: { plan: "pro" }, error: null };
    await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    expect(reserveArgs().p_source_limit).toBe(25);
  });

  it("defaults to the Free limit when the account row isn't found", async () => {
    const projectId = await seedProject("owner_noaccount", "pk_noaccount");
    as("owner_noaccount");
    fake.accountsResult = { data: null, error: null };
    await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    expect(reserveArgs().p_source_limit).toBe(3);
  });
});

describe("reserve_knowledge_source refusals", () => {
  it("maps AWLIM to 403 plan_limit", async () => {
    const projectId = await seedProject("owner_awlim", "pk_awlim");
    as("owner_awlim");
    fake.rpc.mockResolvedValue({ data: null, error: { code: "AWLIM", message: "limit reached" } });

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("plan_limit");
    expect(createKnowledgeUploadUrl).not.toHaveBeenCalled();
  });

  it("maps AWNOP to 404", async () => {
    const projectId = await seedProject("owner_awnop", "pk_awnop");
    as("owner_awnop");
    fake.rpc.mockResolvedValue({ data: null, error: { code: "AWNOP", message: "not found" } });

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    expect(res.status).toBe(404);
  });

  it("maps an unexpected error to 500", async () => {
    const projectId = await seedProject("owner_unexpected", "pk_unexpected");
    as("owner_unexpected");
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.rpc.mockResolvedValue({ data: null, error: { code: "XXXXX", message: "boom" } });

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    expect(res.status).toBe(500);
  });
});

describe("signing failure", () => {
  it("frees the reserved slot with 500 when signing the upload URL fails", async () => {
    const projectId = await seedProject("owner_signfail", "pk_signfail");
    as("owner_signfail");
    vi.spyOn(console, "error").mockImplementation(() => {});
    createKnowledgeUploadUrl.mockRejectedValue(new Error("storage down"));

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    expect(res.status).toBe(500);
    expect(fake.deleteEq).toHaveBeenCalledWith("id", reserveArgs().p_source_id);
  });
});

describe("abandoned reservations", () => {
  it("reclaims a project's own stale processing reservations before counting against the limit", async () => {
    const projectId = await seedProject("owner_stale", "pk_stale");
    as("owner_stale");
    fake.staleResult = {
      data: [{ id: "stale-1", storage_key: "projects/p/old" }],
      error: null,
    };

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    expect(res.status).toBe(201);

    expect(fake.deleteEq).toHaveBeenCalledWith("id", "stale-1");
    expect(deleteKnowledgeFile).toHaveBeenCalledWith("projects/p/old");
  });

  it("does nothing when there are no stale reservations", async () => {
    const projectId = await seedProject("owner_recent", "pk_recent");
    as("owner_recent");

    await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));

    expect(fake.deleteEq).not.toHaveBeenCalled();
    expect(deleteKnowledgeFile).not.toHaveBeenCalled();
  });

  it("looking up stale reservations failing doesn't block the new reservation", async () => {
    const projectId = await seedProject("owner_lookupfail", "pk_lookupfail");
    as("owner_lookupfail");
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.staleResult = { data: [], error: { message: "db down" } };

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(projectId));
    expect(res.status).toBe(201);
  });
});
