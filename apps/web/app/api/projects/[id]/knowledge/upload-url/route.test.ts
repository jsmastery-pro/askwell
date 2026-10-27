// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "../../../../../../lib/supabase/fake";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ userId: null as string | null, owner: undefined as unknown }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));
// Ownership (lib/projects) and the plan (lib/data/billing) both read through the owner client
// (RLS). Which rows RLS lets an owner see is tested against the real migrations on pglite
// (packages/db); here, another owner's project is simply a row the fake doesn't return.
vi.mock("../../../../../../lib/supabase/owner", () => ({ createOwnerClient: () => state.owner }));

const PROJECT_ID = "11111111-2222-4333-8444-555555555555";

type Row = Record<string, unknown>;
const fake = vi.hoisted(() => ({
  rpc: vi.fn(),
  staleResult: { data: [] as Row[], error: null as Row | null },
}));

// `.delete()` resolves whether the route awaits after one `.eq("id", ...)` (the free-the-slot
// path) or chains a second `.eq("status", ...)` first (reclaimAbandoned): both always "succeed"
// with one row affected, since no test here needs the delete itself to fail.
const DELETED = { data: null, error: null, count: 1 };
type DeleteChain = PromiseLike<typeof DELETED> & { eq: () => DeleteChain };
function deleteChain(): DeleteChain {
  const chain: DeleteChain = { eq: () => chain, then: (resolve) => Promise.resolve(DELETED).then(resolve) };
  return chain;
}

function serviceFrom(table: string) {
  if (table !== "knowledge_sources") throw new Error(`unexpected table ${table}`);
  return {
    select: () => ({ eq: () => ({ eq: () => ({ lt: async () => fake.staleResult }) }) }),
    delete: () => deleteChain(),
  };
}
vi.mock("../../../../../../lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: fake.rpc, from: serviceFrom }) }));

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

function rpcRow(overrides: Partial<{ id: string; title: string; type: string; status: string; created_at: string }> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "doc.pdf",
    type: "pdf",
    status: "uploading",
    created_at: "2026-10-27T10:00:00+00:00",
    ...overrides,
  };
}

beforeEach(() => {
  state.userId = null;
  state.owner = undefined;
  fake.rpc.mockReset();
  fake.rpc.mockResolvedValue({ data: rpcRow(), error: null });
  fake.staleResult = { data: [], error: null };
  createKnowledgeUploadUrl.mockReset();
  createKnowledgeUploadUrl.mockResolvedValue({ path: "projects/p/s", token: "tok" });
  deleteKnowledgeFile.mockReset();
  deleteKnowledgeFile.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Signs in `userId`, with an owner client that sees `project` (default: PROJECT_ID) and `plan`. */
function signIn(userId: string, { project = { id: PROJECT_ID }, plan = "free" }: { project?: unknown; plan?: "free" | "pro" } = {}) {
  state.userId = userId;
  state.owner = fakeSupabase({ from: { projects: { data: project }, accounts: { data: { plan } } } });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

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
    signIn("owner_b", { project: null });
    const res = await POST(request({ fileName: "a.pdf", size: 100 }), ctx(PROJECT_ID));
    expect(res.status).toBe(404);
  });
});

describe("validation", () => {
  it("rejects an unsupported extension with 400, before reserving anything", async () => {
    signIn("owner_ext");
    const res = await POST(request({ fileName: "virus.exe", size: 100 }), ctx(PROJECT_ID));
    expect(res.status).toBe(400);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("rejects a declared size over the limit with 413, before reserving anything", async () => {
    signIn("owner_size");
    const res = await POST(request({ fileName: "big.pdf", size: 11 * 1024 * 1024 }), ctx(PROJECT_ID));
    expect(res.status).toBe(413);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});

describe("success", () => {
  it("reserves the source, signs an upload URL, and returns both", async () => {
    signIn("owner_ok");

    const res = await POST(request({ fileName: "doc.pdf", size: 1000, title: "My title" }), ctx(PROJECT_ID));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      source: { id: rpcRow().id, title: "doc.pdf", type: "pdf", status: "uploading" },
      path: "projects/p/s",
      token: "tok",
    });

    const args = reserveArgs();
    expect(args).toMatchObject({
      p_project_id: PROJECT_ID,
      p_title: "My title",
      p_type: "pdf",
      p_source_limit: 3,
    });
    expect(args.p_storage_key).toBe(`projects/${PROJECT_ID}/${args.p_source_id}`);
    expect(createKnowledgeUploadUrl).toHaveBeenCalledWith(args.p_storage_key);
  });

  it("falls back to the file name when no title is given", async () => {
    signIn("owner_notitle");
    await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(PROJECT_ID));
    expect(reserveArgs().p_title).toBe("doc.pdf");
  });

  it("passes the Pro plan's higher source limit", async () => {
    signIn("owner_pro", { plan: "pro" });
    await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(PROJECT_ID));
    expect(reserveArgs().p_source_limit).toBe(25);
  });

  it("defaults to the Free limit when the account row isn't found", async () => {
    state.userId = "owner_noaccount";
    state.owner = fakeSupabase({ from: { projects: { data: { id: PROJECT_ID } }, accounts: { data: null } } });
    await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(PROJECT_ID));
    expect(reserveArgs().p_source_limit).toBe(3);
  });
});

describe("reserve_knowledge_source refusals", () => {
  it("maps AWLIM to 403 plan_limit", async () => {
    signIn("owner_awlim");
    fake.rpc.mockResolvedValue({ data: null, error: { code: "AWLIM", message: "limit reached" } });

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(PROJECT_ID));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("plan_limit");
    expect(createKnowledgeUploadUrl).not.toHaveBeenCalled();
  });

  it("maps AWNOP to 404", async () => {
    signIn("owner_awnop");
    fake.rpc.mockResolvedValue({ data: null, error: { code: "AWNOP", message: "not found" } });

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(PROJECT_ID));
    expect(res.status).toBe(404);
  });

  it("maps an unexpected error to 500", async () => {
    signIn("owner_unexpected");
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.rpc.mockResolvedValue({ data: null, error: { code: "XXXXX", message: "boom" } });

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(PROJECT_ID));
    expect(res.status).toBe(500);
  });
});

describe("signing failure", () => {
  it("frees the reserved slot with 500 when signing the upload URL fails", async () => {
    signIn("owner_signfail");
    vi.spyOn(console, "error").mockImplementation(() => {});
    createKnowledgeUploadUrl.mockRejectedValue(new Error("storage down"));

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(PROJECT_ID));
    expect(res.status).toBe(500);
  });
});

describe("abandoned reservations", () => {
  it("reclaims a project's own stale uploading reservations before counting against the limit", async () => {
    signIn("owner_stale");
    fake.staleResult = { data: [{ id: "stale-1", storage_key: "projects/p/old" }], error: null };

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(PROJECT_ID));
    expect(res.status).toBe(201);

    expect(deleteKnowledgeFile).toHaveBeenCalledWith("projects/p/old");
  });

  it("does nothing when there are no stale reservations", async () => {
    signIn("owner_recent");

    await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(PROJECT_ID));

    expect(deleteKnowledgeFile).not.toHaveBeenCalled();
  });

  it("looking up stale reservations failing doesn't block the new reservation", async () => {
    signIn("owner_lookupfail");
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.staleResult = { data: [], error: { message: "db down" } };

    const res = await POST(request({ fileName: "doc.pdf", size: 1000 }), ctx(PROJECT_ID));
    expect(res.status).toBe(201);
  });
});
