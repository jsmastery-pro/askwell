// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { argsOf, callsTo, fakeSupabase, type FakeSupabase } from "../../../../lib/supabase/fake";

// Ownership is read through the owner client (RLS); that RLS hides another owner's source is
// tested against the real migrations on pglite (packages/db). Here, another owner's source is
// one the fake owner client doesn't return.
vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ userId: null as string | null, owner: undefined as unknown }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));
vi.mock("../../../../lib/supabase/owner", () => ({ createOwnerClient: () => state.owner }));
vi.mock("../../../../lib/supabase/service", () => ({
  createServiceClient: () => {
    throw new Error("real service client used in a test");
  },
}));

// lib/knowledge owns the row delete (and moves to the service client in SB-T07): mocked whole,
// so this test never depends on how it reaches the database.
const deleteKnowledgeSource = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/knowledge", () => ({ deleteKnowledgeSource }));

const deleteKnowledgeFile = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/storage", () => ({ deleteKnowledgeFile }));

const { DELETE } = await import("./route");

const SOURCE_ID = "00000000-0000-4000-8000-000000000001";

let owner: FakeSupabase;

/** The signed-in owner's client, returning `source` (or nothing: unknown or another owner's). */
function signIn(userId: string, source: { storage_key: string | null } | null) {
  state.userId = userId;
  owner = fakeSupabase({
    from: { knowledge_sources: { data: source && { id: SOURCE_ID, project_id: "p1", ...source } } },
  });
  state.owner = owner;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("https://app.test/api/knowledge/x", { method: "DELETE" });

beforeEach(() => {
  state.userId = null;
  state.owner = undefined;
  deleteKnowledgeSource.mockReset();
  deleteKnowledgeSource.mockResolvedValue(undefined);
  deleteKnowledgeFile.mockReset();
  deleteKnowledgeFile.mockResolvedValue(undefined);
});

describe("unauthenticated", () => {
  it("returns 401", async () => {
    const res = await DELETE(req(), ctx(SOURCE_ID));
    expect(res.status).toBe(401);
    expect(deleteKnowledgeSource).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/knowledge/:id", () => {
  it("returns 404 for an unknown or another owner's source, without deleting", async () => {
    signIn("owner_b", null);

    const res = await DELETE(req(), ctx(SOURCE_ID));

    expect(res.status).toBe(404);
    expect(argsOf(callsTo(owner, "knowledge_sources")[0], "eq")).toEqual(["id", SOURCE_ID]);
    expect(deleteKnowledgeSource).not.toHaveBeenCalled();
    expect(deleteKnowledgeFile).not.toHaveBeenCalled();
  });

  it("returns 404 for a malformed id without querying", async () => {
    signIn("owner_a", null);

    const res = await DELETE(req(), ctx("not-a-uuid"));

    expect(res.status).toBe(404);
    expect(owner.calls).toEqual([]);
  });

  it("deletes a pasted-text source's row, with no storage object", async () => {
    signIn("owner_text", { storage_key: null });

    const res = await DELETE(req(), ctx(SOURCE_ID));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteKnowledgeSource).toHaveBeenCalledWith(SOURCE_ID);
    expect(deleteKnowledgeFile).not.toHaveBeenCalled();
  });

  it("deletes a file source's row, then its storage object", async () => {
    signIn("owner_file", { storage_key: "projects/p1/file" });

    const res = await DELETE(req(), ctx(SOURCE_ID));

    expect(res.status).toBe(200);
    expect(deleteKnowledgeSource).toHaveBeenCalledWith(SOURCE_ID);
    expect(deleteKnowledgeFile).toHaveBeenCalledWith("projects/p1/file");
    expect(deleteKnowledgeSource.mock.invocationCallOrder[0]).toBeLessThan(deleteKnowledgeFile.mock.invocationCallOrder[0]!);
  });

  it("still succeeds when the storage delete fails", async () => {
    signIn("owner_storagefail", { storage_key: "projects/p1/gone" });
    deleteKnowledgeFile.mockRejectedValueOnce(new Error("not found in storage"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});

    const res = await DELETE(req(), ctx(SOURCE_ID));

    expect(res.status).toBe(200);
    expect(deleteKnowledgeSource).toHaveBeenCalledWith(SOURCE_ID);
  });

  it("leaves the storage object when the row delete fails, so it can be retried", async () => {
    signIn("owner_rowfail", { storage_key: "projects/p1/file" });
    deleteKnowledgeSource.mockRejectedValueOnce(new Error("db down"));

    await expect(DELETE(req(), ctx(SOURCE_ID))).rejects.toThrow("db down");
    expect(deleteKnowledgeFile).not.toHaveBeenCalled();
  });
});
