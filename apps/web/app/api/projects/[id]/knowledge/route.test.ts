import { EMBEDDING_DIMENSIONS, PLAN_LIMITS } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabase,
  PUBLISHABLE_KEY,
  SECRET_KEY,
  SUPABASE_URL,
  tokenFor,
  type FakeSupabase,
} from "../../../../../lib/knowledge/fake-supabase";

// Real route → lib → supabase-js; Clerk's auth(), OpenAI and the network (a
// fake Supabase with RLS and the migration's functions) are faked.
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
vi.mock("../../../../../lib/ai/openai", () => ({ embedTexts: (texts: string[]) => embedTexts(texts) }));

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

const ALICE = "user_alice";
const BOB = "user_bob";
const ALICES = "00000000-0000-4000-8000-00000000000a";
const BOBS = "00000000-0000-4000-8000-00000000000b";
let db: FakeSupabase;

const post = (projectId: string, body: unknown) =>
  POST(
    new Request(`http://localhost/api/projects/${projectId}/knowledge`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
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
  embedTexts.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
  captureImmediate.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/projects/:id/knowledge", () => {
  it("sends knowledge_added once (text) when the source is ready; never the text", async () => {
    expect((await post(ALICES, { title: "Refunds", text: "Refunds take 5 business days." })).status).toBe(201);
    const events = await sentEvents();
    expect(events).toEqual([
      { distinctId: ALICE, event: "knowledge_added", properties: { project_id: ALICES, source_type: "text" } },
    ]);
    expect(JSON.stringify(events)).not.toContain("Refunds");
  });

  it("sends no knowledge_added when processing fails or the request is refused", async () => {
    embedTexts.mockRejectedValueOnce(new Error("OpenAI is down"));
    expect((await (await post(ALICES, { title: "T", text: "Some text." })).json()).source.status).toBe("failed");
    expect((await post(BOBS, { title: "Sneaky", text: "x" })).status).toBe(404);
    expect(await sentEvents()).toEqual([]);
  });

  it("an analytics failure doesn't change the response", async () => {
    captureImmediate.mockRejectedValue(new Error("PostHog is down"));
    const res = await post(ALICES, { title: "T", text: "Some text." });
    expect(res.status).toBe(201);
    expect((await res.json()).source.status).toBe("ready");
    await sentEvents();
  });

  it("adds the text, processes it into chunks, and returns the ready source (201)", async () => {
    const res = await post(ALICES, { title: "Refunds", text: "Refunds take 5 business days." });
    expect(res.status).toBe(201);
    const { source } = await res.json();
    expect(source).toMatchObject({ project_id: ALICES, title: "Refunds", type: "text", storage_key: null, status: "ready" });
    expect(db.chunks).toHaveLength(1);
    expect(db.chunks[0]).toMatchObject({ project_id: ALICES, source_id: source.id, content: "Refunds take 5 business days." });
    // The limit came from the plan read on the server.
    const rpc = db.requests.find((r) => r.path.endsWith("/rpc/reserve_knowledge_source"));
    expect(rpc).toMatchObject({ caller: { kind: "service" } });
    expect(rpc?.body).toMatchObject({ p_status: "processing", p_storage_key: null, p_max_sources: PLAN_LIMITS.free.knowledgeSources });
  });

  it("strips NUL characters before storing", async () => {
    const res = await post(ALICES, { title: "T", text: "A\u0000B" });
    expect(res.status).toBe(201);
    expect(db.chunks[0]?.content).toBe("AB");
  });

  it("text that is only NUL characters is a 400, and nothing is reserved", async () => {
    const res = await post(ALICES, { title: "T", text: "\u0000\u0000" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_failed");
    expect(db.sources).toHaveLength(0);
  });

  it("another owner's project is a 404, and nothing is written", async () => {
    const res = await post(BOBS, { title: "Sneaky", text: "x" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Project not found." } });
    expect(db.sources).toHaveLength(0);
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it(`the ${PLAN_LIMITS.free.knowledgeSources + 1}th source on Free is 403 plan_limit_reached`, async () => {
    for (let i = 0; i < PLAN_LIMITS.free.knowledgeSources; i++) {
      expect((await post(ALICES, { title: `T${i}`, text: `Text ${i}.` })).status).toBe(201);
    }
    const res = await post(ALICES, { title: "One more", text: "x" });
    expect(res.status).toBe(403);
    const { error } = await res.json();
    expect(error.code).toBe("plan_limit_reached");
    expect(error.message).toMatch(/Free plan allows 3 knowledge sources per project\. Delete one, or upgrade to Pro/);
    expect(db.sources).toHaveLength(PLAN_LIMITS.free.knowledgeSources);
  });

  it("uses the Pro limit for a Pro owner", async () => {
    db.accounts.set(ALICE, "pro");
    await post(ALICES, { title: "T", text: "x" });
    const rpc = db.requests.find((r) => r.path.endsWith("/rpc/reserve_knowledge_source"));
    expect(rpc?.body).toMatchObject({ p_max_sources: PLAN_LIMITS.pro.knowledgeSources });
  });

  it("an embedding failure returns the source as failed, with no chunks", async () => {
    embedTexts.mockRejectedValueOnce(new Error("OpenAI is down"));
    const res = await post(ALICES, { title: "T", text: "Some text." });
    expect(res.status).toBe(201);
    expect((await res.json()).source.status).toBe("failed");
    expect(db.chunks).toHaveLength(0);
  });

  it("deletes the files of reservations the reserve reclaimed", async () => {
    db.addSource({ project_id: ALICES, title: "old.pdf", type: "pdf", storage_key: `${ALICES}/old.pdf`, status: "uploading" });
    db.files.set(`${ALICES}/old.pdf`, new Uint8Array([1]));
    db.advance(2 * 60 * 60 * 1000 + 1);
    expect((await post(ALICES, { title: "T", text: "x" })).status).toBe(201);
    expect(db.files.has(`${ALICES}/old.pdf`)).toBe(false);
    expect(db.sources.map((s) => s.title)).toEqual(["T"]);
  });

  it.each([
    ["an empty title", { title: " ", text: "x" }],
    ["no text", { title: "T" }],
    ["an extra field", { title: "T", text: "x", status: "ready" }],
    ["text over MAX_PASTED_TEXT_LENGTH", { title: "T", text: "x".repeat(50_001) }],
  ])("%s is 400 validation_failed", async (_label, body) => {
    const res = await post(ALICES, body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_failed");
  });

  it("is 401 without a session", async () => {
    signedInAs = null;
    expect((await post(ALICES, { title: "T", text: "x" })).status).toBe(401);
  });

  it("allows 60 s", () => {
    expect(maxDuration).toBe(60);
  });
});
