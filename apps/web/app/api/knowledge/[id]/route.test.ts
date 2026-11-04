import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabase,
  PUBLISHABLE_KEY,
  SECRET_KEY,
  SUPABASE_URL,
  tokenFor,
  type FakeSupabase,
} from "../../../../lib/knowledge/fake-supabase";

vi.mock("server-only", () => ({}));
let signedInAs: string | null = null;
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    isAuthenticated: signedInAs !== null,
    userId: signedInAs,
    getToken: async () => (signedInAs ? tokenFor(signedInAs) : null),
  }),
}));

const { DELETE } = await import("./route");

const ALICE = "user_alice";
const ALICES = "00000000-0000-4000-8000-00000000000a";
const BOBS = "00000000-0000-4000-8000-00000000000b";
let db: FakeSupabase;

const del = (id: string) =>
  DELETE(new Request(`http://localhost/api/knowledge/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  } as never);

beforeEach(() => {
  db = createFakeSupabase();
  vi.stubGlobal("fetch", db.fetch);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubEnv(["SUPABASE", "SECRET", "KEY"].join("_"), SECRET_KEY);
  db.projects.push({ id: ALICES, owner_id: ALICE, name: "Alice's" }, { id: BOBS, owner_id: "user_bob", name: "Bob's" });
  signedInAs = ALICE;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function fileSource(project: string) {
  const key = `${project}/doc.pdf`;
  const source = db.addSource({ project_id: project, title: "doc.pdf", type: "pdf", storage_key: key, status: "ready" });
  db.files.set(key, new Uint8Array([1, 2, 3]));
  db.chunks.push({ id: "c1", project_id: project, source_id: source.id, content: "x", embedding: "[0]" });
  return { source, key };
}

describe("DELETE /api/knowledge/:id", () => {
  it("deletes the source, its chunks and its file", async () => {
    const { source, key } = fileSource(ALICES);
    const res = await del(source.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: source.id });
    expect(db.sources).toHaveLength(0);
    expect(db.chunks).toHaveLength(0);
    expect(db.files.has(key)).toBe(false);
    // Found with the owner client (RLS), then deleted with the service client.
    const read = db.requests.find((r) => r.method === "GET" && r.path.endsWith("/knowledge_sources"));
    expect(read?.caller).toEqual({ kind: "owner", userId: ALICE });
  });

  it("deletes pasted text (no file) without touching Storage", async () => {
    const source = db.addSource({ project_id: ALICES, title: "T", type: "text", storage_key: null, status: "ready" });
    expect((await del(source.id)).status).toBe(200);
    expect(db.sources).toHaveLength(0);
    expect(db.requests.some((r) => r.path.startsWith("/storage/"))).toBe(false);
  });

  it("another owner's source is a 404, and nothing is deleted", async () => {
    const { source, key } = fileSource(BOBS);
    const res = await del(source.id);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Knowledge source not found." } });
    expect(db.sources).toHaveLength(1);
    expect(db.chunks).toHaveLength(1);
    expect(db.files.has(key)).toBe(true);
  });

  it("an id that isn't a uuid is 400", async () => {
    expect((await del("nope")).status).toBe(400);
  });

  it("is 401 without a session", async () => {
    signedInAs = null;
    expect((await del("00000000-0000-4000-8000-000000000001")).status).toBe(401);
  });
});
