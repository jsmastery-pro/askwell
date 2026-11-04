import { MAX_KNOWLEDGE_FILE_BYTES, PLAN_LIMITS } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabase,
  PUBLISHABLE_KEY,
  SECRET_KEY,
  SUPABASE_URL,
  tokenFor,
  type FakeSupabase,
} from "../../../../../../lib/knowledge/fake-supabase";

vi.mock("server-only", () => ({}));
let signedInAs: string | null = null;
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    isAuthenticated: signedInAs !== null,
    userId: signedInAs,
    getToken: async () => (signedInAs ? tokenFor(signedInAs) : null),
  }),
}));

const { POST } = await import("./route");

const ALICE = "user_alice";
const BOB = "user_bob";
const ALICES = "00000000-0000-4000-8000-00000000000a";
const BOBS = "00000000-0000-4000-8000-00000000000b";
let db: FakeSupabase;

const pdf = (fileName = "Handbook.pdf", sizeBytes = 1234) => ({ fileName, sizeBytes, mimeType: "application/pdf" });

const post = (projectId: string, body: unknown) =>
  POST(
    new Request(`http://localhost/api/projects/${projectId}/knowledge/upload-url`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: projectId }) } as never,
  );

beforeEach(() => {
  db = createFakeSupabase();
  vi.stubGlobal("fetch", db.fetch);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubEnv(["SUPABASE", "SECRET", "KEY"].join("_"), SECRET_KEY);
  db.accounts.set(ALICE, "free");
  db.accounts.set(BOB, "free");
  db.projects.push({ id: ALICES, owner_id: ALICE, name: "Alice's bot" }, { id: BOBS, owner_id: BOB, name: "Bob's bot" });
  signedInAs = ALICE;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/projects/:id/knowledge/upload-url", () => {
  it("reserves an uploading source under the project's prefix and returns a signed upload (201)", async () => {
    const res = await post(ALICES, pdf());
    expect(res.status).toBe(201);
    const { source, upload } = await res.json();

    expect(source).toMatchObject({ project_id: ALICES, title: "Handbook.pdf", type: "pdf", status: "uploading" });
    expect(source.storage_key).toMatch(new RegExp(`^${ALICES}/[0-9a-f-]{36}\\.pdf$`));
    expect(upload.path).toBe(source.storage_key);
    expect(upload.token).toBe(`tok_${source.storage_key}`);
    expect(upload.signedUrl).toContain(`/storage/v1/object/upload/sign/knowledge/${source.storage_key}`);

    const sign = db.requests.find((r) => r.path.includes("/object/upload/sign/"));
    expect(sign?.caller).toEqual({ kind: "service" });
  });

  it("another owner's project is a 404, and nothing is reserved", async () => {
    const res = await post(BOBS, pdf());
    expect(res.status).toBe(404);
    expect(db.sources).toHaveLength(0);
  });

  it("is 403 plan_limit_reached at the Free limit, and signs nothing", async () => {
    for (let i = 0; i < PLAN_LIMITS.free.knowledgeSources; i++) {
      db.addSource({ project_id: ALICES, title: `S${i}`, type: "text", storage_key: null, status: "ready" });
    }
    const res = await post(ALICES, pdf());
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("plan_limit_reached");
    expect(db.requests.some((r) => r.path.includes("/object/upload/sign/"))).toBe(false);
  });

  it("an uploading reservation counts toward the limit until it's 2 hours old, then is reclaimed with its file", async () => {
    for (let i = 0; i < PLAN_LIMITS.free.knowledgeSources; i++) {
      db.addSource({ project_id: ALICES, title: `U${i}`, type: "md", storage_key: `${ALICES}/u${i}.md`, status: "uploading" });
      db.files.set(`${ALICES}/u${i}.md`, new Uint8Array([1]));
    }
    expect((await post(ALICES, pdf())).status).toBe(403);

    db.advance(2 * 60 * 60 * 1000 + 1);
    expect((await post(ALICES, pdf())).status).toBe(201);
    expect(db.files.size).toBe(0);
  });

  it.each([
    ["a .exe", { fileName: "setup.exe", sizeBytes: 10, mimeType: "application/octet-stream" }],
    ["over 10 MB", pdf("big.pdf", MAX_KNOWLEDGE_FILE_BYTES + 1)],
    ["a MIME type that doesn't match", { fileName: "a.pdf", sizeBytes: 10, mimeType: "text/plain" }],
    ["a name over 200 characters", pdf(`${"n".repeat(200)}.pdf`)],
  ])("refuses %s with 400 validation_failed, reserving nothing", async (_label, body) => {
    const res = await post(ALICES, body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_failed");
    expect(db.sources).toHaveLength(0);
  });

  it("drops the reservation when signing the upload fails", async () => {
    const fakeFetch = db.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("/object/upload/sign/")
        ? new Response(JSON.stringify({ statusCode: "500", error: "boom", message: "boom" }), { status: 500 })
        : fakeFetch(input, init),
    );
    const res = await post(ALICES, pdf());
    expect(res.status).toBe(500);
    expect(db.sources).toHaveLength(0);
  });
});
