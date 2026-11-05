import { readFileSync } from "node:fs";
import { EMBEDDING_DIMENSIONS, MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
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
const embedTexts = vi.fn(async (texts: string[]) => texts.map(() => Array<number>(EMBEDDING_DIMENSIONS).fill(0.1)));
vi.mock("../../../../../../lib/ai/openai", () => ({ embedTexts: (texts: string[]) => embedTexts(texts) }));

// PostHog: the real lib/analytics/server.ts, with posthog-node's network
// call recorded. after() has no request here, so events go out at once.
type SentEvent = { distinctId: string; event: string; properties?: Record<string, unknown> };
const captureImmediate = vi.fn(async (_event: SentEvent) => {});
vi.mock("posthog-node", () => ({
  PostHog: vi.fn(function (this: object) {
    Object.assign(this, { captureImmediate });
  }),
}));
/** The PostHog events sent so far (after pending sends run). */
const sentEvents = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  return captureImmediate.mock.calls.map(([event]) => event);
};

const { POST, maxDuration } = await import("./route");
const { MAX_CHUNKS_PER_SOURCE } = await import("../../../../../../lib/knowledge/sources");

const ALICE = "user_alice";
const ALICES = "00000000-0000-4000-8000-00000000000a";
const BOBS = "00000000-0000-4000-8000-00000000000b";
const PDF = new Uint8Array(readFileSync(new URL("../../../../../../lib/knowledge/fixtures/two-pages.pdf", import.meta.url)));
let db: FakeSupabase;

const post = (projectId: string, sourceId: string) =>
  POST(
    new Request(`http://localhost/api/projects/${projectId}/knowledge/finalize`, {
      method: "POST",
      body: JSON.stringify({ sourceId }),
    }),
    { params: Promise.resolve({ id: projectId }) } as never,
  );

/** A reserved upload of `type`, with `bytes` uploaded (or nothing, for null). */
function uploaded(type: "pdf" | "md" | "txt", bytes: Uint8Array | null, project = ALICES) {
  const key = `${project}/file.${type}`;
  const source = db.addSource({ project_id: project, title: `file.${type}`, type, storage_key: key, status: "uploading" });
  if (bytes) db.files.set(key, bytes);
  return { source, key };
}

beforeEach(() => {
  db = createFakeSupabase();
  vi.stubGlobal("fetch", db.fetch);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubEnv(["SUPABASE", "SECRET", "KEY"].join("_"), SECRET_KEY);
  db.accounts.set(ALICE, "free");
  db.projects.push({ id: ALICES, owner_id: ALICE, name: "Alice's bot" }, { id: BOBS, owner_id: "user_bob", name: "Bob's" });
  signedInAs = ALICE;
  embedTexts.mockClear();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
  captureImmediate.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/projects/:id/knowledge/finalize", () => {
  it("sends knowledge_added once with the file type when the upload is ready; never its contents", async () => {
    const { source } = uploaded("md", new TextEncoder().encode("# Shipping\nWe ship worldwide."));
    expect((await post(ALICES, source.id)).status).toBe(200);
    // A repeat finalize is a 404 and sends nothing more.
    expect((await post(ALICES, source.id)).status).toBe(404);
    const events = await sentEvents();
    expect(events).toEqual([
      { distinctId: ALICE, event: "knowledge_added", properties: { project_id: ALICES, source_type: "md" } },
    ]);
    expect(JSON.stringify(events)).not.toContain("ship");
  });

  it("sends no knowledge_added for a refused, failed or missing upload", async () => {
    expect((await post(ALICES, uploaded("txt", null).source.id)).status).toBe(400);
    embedTexts.mockRejectedValueOnce(new Error("OpenAI is down"));
    const failed = uploaded("pdf", PDF).source;
    expect((await (await post(ALICES, failed.id)).json()).source.status).toBe("failed");
    expect(await sentEvents()).toEqual([]);
  });

  it("an analytics failure doesn't change the response", async () => {
    captureImmediate.mockRejectedValue(new Error("PostHog is down"));
    const { source } = uploaded("txt", new TextEncoder().encode("Hello."));
    const res = await post(ALICES, source.id);
    expect(res.status).toBe(200);
    expect((await res.json()).source.status).toBe("ready");
    await sentEvents();
  });

  it("claims an uploaded PDF, extracts and processes it, and returns it ready", async () => {
    const { source, key } = uploaded("pdf", PDF);
    const res = await post(ALICES, source.id);
    expect(res.status).toBe(200);
    expect((await res.json()).source).toMatchObject({ id: source.id, status: "ready", type: "pdf" });
    expect(db.chunks).toHaveLength(1);
    expect(db.chunks[0]).toMatchObject({
      project_id: ALICES,
      source_id: source.id,
      content: "Askwell answers questions.\n\nRefunds take 5 business days.",
    });
    expect(db.files.has(key)).toBe(true);
  });

  it("processes Markdown and TXT as UTF-8", async () => {
    const { source } = uploaded("md", new TextEncoder().encode("# FAQ\n\nWe ship worldwide."));
    expect((await post(ALICES, source.id)).status).toBe(200);
    expect(db.chunks[0]?.content).toBe("# FAQ\n\nWe ship worldwide.");
  });

  it("a second finalize of the same source is a 404 and processes nothing again", async () => {
    const { source } = uploaded("pdf", PDF);
    expect((await post(ALICES, source.id)).status).toBe(200);
    embedTexts.mockClear();
    const res = await post(ALICES, source.id);
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toBe("This upload doesn't exist or was already finalized.");
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it("refuses a renamed .exe as .pdf: 400, and deletes its file and source", async () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]); // "MZ…"
    const { source, key } = uploaded("pdf", exe);
    const res = await post(ALICES, source.id);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "validation_failed", message: "That file isn't a PDF." } });
    expect(db.files.has(key)).toBe(false);
    expect(db.sources).toHaveLength(0);
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it("refuses a file over 10 MB (its real size) and deletes it", async () => {
    const { source, key } = uploaded("txt", new Uint8Array(MAX_KNOWLEDGE_FILE_BYTES + 1).fill(0x61));
    const res = await post(ALICES, source.id);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("The uploaded file is over 10 MB.");
    expect(db.files.has(key)).toBe(false);
    expect(db.sources).toHaveLength(0);
  });

  it.each([
    ["a PDF with the magic bytes but no readable content", "pdf", new TextEncoder().encode("%PDF-1.4 garbage"), "This PDF can't be read."],
    ["invalid UTF-8", "txt", new Uint8Array([0xff, 0xfe, 0x00]), "This file isn't UTF-8 text."],
    ["a whitespace-only file", "md", new TextEncoder().encode(" \n "), "This file has no text."],
  ] as const)("refuses %s and deletes it", async (_label, type, bytes, message) => {
    const { source, key } = uploaded(type, bytes);
    const res = await post(ALICES, source.id);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe(message);
    expect(db.files.has(key)).toBe(false);
    expect(db.sources).toHaveLength(0);
  });

  it("refuses text past MAX_CHUNKS_PER_SOURCE chunks without embedding anything", async () => {
    const text = "word ".repeat(MAX_CHUNKS_PER_SOURCE * 400);
    const { source, key } = uploaded("txt", new TextEncoder().encode(text));
    const res = await post(ALICES, source.id);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/too much text/);
    expect(embedTexts).not.toHaveBeenCalled();
    expect(db.files.has(key)).toBe(false);
  });

  it("a source whose file was never uploaded is refused and deleted", async () => {
    const { source } = uploaded("pdf", null);
    const res = await post(ALICES, source.id);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("The file wasn't uploaded. Try again.");
    expect(db.sources).toHaveLength(0);
  });

  it("another owner's project is a 404, and their source stays uploading", async () => {
    const { source } = uploaded("pdf", PDF, BOBS);
    expect((await post(BOBS, source.id)).status).toBe(404);
    expect(db.sources[0]?.status).toBe("uploading");
  });

  it("a source from another project can't be finalized through the caller's project", async () => {
    const { source } = uploaded("pdf", PDF, BOBS);
    const res = await post(ALICES, source.id);
    expect(res.status).toBe(404);
    expect(db.sources[0]?.status).toBe("uploading");
    expect(db.files.size).toBe(1);
  });

  it("an embedding failure returns the source as failed and keeps its file", async () => {
    embedTexts.mockRejectedValueOnce(new Error("OpenAI is down"));
    const { source, key } = uploaded("pdf", PDF);
    const res = await post(ALICES, source.id);
    expect(res.status).toBe(200);
    expect((await res.json()).source.status).toBe("failed");
    expect(db.chunks).toHaveLength(0);
    expect(db.files.has(key)).toBe(true);
  });

  /** Answers requests whose URL matches `match` with a 500, the rest from the fake. */
  function failing(match: (url: string, method: string) => boolean) {
    const fakeFetch = db.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
      match(String(input), init?.method ?? "GET")
        ? new Response(JSON.stringify({ statusCode: "500", code: "XX000", message: "boom" }), { status: 500 })
        : fakeFetch(input, init),
    );
  }

  it("an unexpected error after the claim marks the source failed (not stuck processing), then 500", async () => {
    const { source, key } = uploaded("pdf", PDF);
    failing((url, method) => method === "GET" && url.includes("/storage/v1/object/knowledge/"));
    const res = await post(ALICES, source.id);
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
    expect(db.sources[0]).toMatchObject({ id: source.id, status: "failed" });
    expect(db.files.has(key)).toBe(true);
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it("an error reading the source back after processing leaves it ready", async () => {
    const { source } = uploaded("pdf", PDF);
    failing((url, method) => method === "GET" && url.includes("/rest/v1/knowledge_sources"));
    const res = await post(ALICES, source.id);
    expect(res.status).toBe(500);
    expect(db.sources[0]?.status).toBe("ready");
    expect(db.chunks).toHaveLength(1);
  });

  it("allows 300 s", () => {
    expect(maxDuration).toBe(300);
  });
});
