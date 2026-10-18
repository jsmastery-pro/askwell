// @vitest-environment node
import { conversations, knowledgeChunks, knowledgeSources, messages, projects } from "@askwell/db";
import { DONT_KNOW_REPLY, EMBEDDING_DIMENSIONS, PLAN_LIMITS } from "@askwell/shared";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedProject, type TestDb } from "../../../../lib/widget-config/test-db";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@askwell/db/client", () => ({
  get db() {
    return state.db;
  },
}));

// OpenAI is mocked: embeddings return a fixed vector, and the chat model echoes what it was given.
const ai = vi.hoisted(() => ({ create: vi.fn(), embedQuery: vi.fn() }));
vi.mock("../../../../lib/ai", () => ({
  embedQuery: ai.embedQuery,
  getOpenAI: () => ({ responses: { create: ai.create } }),
}));

// Arcjet is mocked at the SDK boundary (no network); the real limiter in lib/rate-limit runs.
type Conclusion = "ALLOW" | "DENY" | "ERROR";
const arcjet = vi.hoisted(() => ({ conclusion: "ALLOW" as Conclusion, protect: vi.fn() }));
vi.mock("@arcjet/next", () => ({
  default: () => ({ protect: arcjet.protect }),
  fixedWindow: () => [],
  cloudflare: () => ({}),
}));

// PostHog is mocked at the SDK boundary; the real helpers in lib/posthog/server run.
const posthog = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("posthog-node", () => ({
  PostHog: class {
    capture = posthog.capture;
    captureException = vi.fn();
  },
}));

const { POST, OPTIONS } = await import("./route");

const unit = (i: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, j) => (j === i ? 1 : 0));

let db: TestDb;
let close: () => Promise<void>;
let shop: { id: string };
let other: { id: string };

async function seedChunk(projectId: string, content: string, axis: number) {
  const [source] = await db
    .insert(knowledgeSources)
    .values({ projectId, title: content.slice(0, 20), type: "text", status: "ready" })
    .returning();
  await db.insert(knowledgeChunks).values({ projectId, sourceId: source!.id, content, embedding: unit(axis) });
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
  shop = await seedProject(db, { plan: "free", publicKey: "pk_shop" });
  other = await seedProject(db, { plan: "pro", publicKey: "pk_other" });
  await seedProject(db, { plan: "free", publicKey: "pk_empty" });
  await seedChunk(shop.id, "We ship worldwide within 5 business days.", 0);
  await seedChunk(other.id, "SECRET: the other project's internal discount code is OTHER50.", 0);
});

afterAll(() => close());

beforeEach(() => {
  vi.stubEnv("ARCJET_KEY", "ajkey_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  arcjet.conclusion = "ALLOW";
  arcjet.protect.mockImplementation(async () => {
    const { conclusion } = arcjet;
    return {
      isErrored: () => conclusion === "ERROR",
      isDenied: () => conclusion === "DENY",
      reason: { isRateLimit: () => conclusion === "DENY", reset: 33, message: "Arcjet timed out" },
    };
  });
  ai.embedQuery.mockResolvedValue(unit(0));
  ai.create.mockImplementation(async ({ input }: { input: string }) => ({
    output_text: input.includes("5 business days") ? "We ship worldwide within 5 business days." : DONT_KNOW_REPLY,
    model: "gpt-test",
    usage: { input_tokens: 100, output_tokens: 10 },
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function chat(body: unknown, ip = "203.0.113.9") {
  return POST(
    new Request("https://app.test/api/widget/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://customer.example", "cf-connecting-ip": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const ask = (message: string, extra: Record<string, unknown> = {}) =>
  chat({ key: "pk_shop", visitorId: "v_1", message, ...extra });

async function usage(projectId: string) {
  const [row] = await db
    .select({ messagesUsed: projects.messagesUsed, periodStart: projects.periodStart })
    .from(projects)
    .where(eq(projects.id, projectId));
  return row!;
}

async function thread(conversationId: string) {
  return db
    .select({ role: messages.role, body: messages.body })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}

async function setUsage(projectId: string, messagesUsed: number, periodStart = new Date()) {
  await db.update(projects).set({ messagesUsed, periodStart }).where(eq(projects.id, projectId));
}

describe("POST /api/widget/chat", () => {
  it("answers a related question from the project's chunks, and saves and counts it", async () => {
    await setUsage(shop.id, 0);
    const res = await ask("How fast do you ship?");

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = await res.json();
    expect(body.reply).toBe("We ship worldwide within 5 business days.");

    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, body.conversationId));
    expect(conversation).toMatchObject({ projectId: shop.id, visitorId: "v_1" });
    expect(await thread(body.conversationId)).toEqual([
      { role: "visitor", body: "How fast do you ship?" },
      { role: "bot", body: "We ship worldwide within 5 business days." },
    ]);
    expect((await usage(shop.id)).messagesUsed).toBe(1);
  });

  it("only searches this project's chunks", async () => {
    await ask("What discount codes exist?");
    const { input } = ai.create.mock.calls[0]![0] as { input: string };
    expect(input).toContain("We ship worldwide");
    expect(input).not.toContain("OTHER50");
  });

  it("returns the model's DONT_KNOW_REPLY for a question the chunks don't answer", async () => {
    ai.create.mockResolvedValueOnce({ output_text: DONT_KNOW_REPLY, model: "gpt-test", usage: { input_tokens: 1, output_tokens: 1 } });
    const body = await (await ask("What's the capital of France?")).json();
    expect(body.reply).toBe(DONT_KNOW_REPLY);
  });

  it("returns DONT_KNOW_REPLY without embedding or calling the model when the project has no chunks, and still counts it", async () => {
    const res = await chat({ key: "pk_empty", visitorId: "v_2", message: "Hello?" });
    const body = await res.json();
    expect(body.reply).toBe(DONT_KNOW_REPLY);
    expect(ai.embedQuery).not.toHaveBeenCalled();
    expect(ai.create).not.toHaveBeenCalled();
    expect(await thread(body.conversationId)).toHaveLength(2);
  });

  it("skips the embedding and the model when the only chunks belong to a source that isn't ready (L8)", async () => {
    const project = await seedProject(db, { plan: "free", publicKey: "pk_processing" });
    const [source] = await db
      .insert(knowledgeSources)
      .values({ projectId: project.id, title: "Half done", type: "text", status: "processing" })
      .returning();
    await db.insert(knowledgeChunks).values({ projectId: project.id, sourceId: source!.id, content: "partial", embedding: unit(0) });

    const body = await (await chat({ key: "pk_processing", visitorId: "v_8", message: "Anything?" })).json();
    expect(body.reply).toBe(DONT_KNOW_REPLY);
    expect(ai.embedQuery).not.toHaveBeenCalled();
    expect(ai.create).not.toHaveBeenCalled();
  });

  it("continues the visitor's own conversation", async () => {
    const first = await (await ask("How fast do you ship?")).json();
    const before = (await usage(shop.id)).messagesUsed;
    const second = await (await ask("And to Canada?", { conversationId: first.conversationId })).json();

    expect(second.conversationId).toBe(first.conversationId);
    expect(await thread(first.conversationId)).toHaveLength(4);
    expect((await usage(shop.id)).messagesUsed).toBe(before + 1);
  });

  it("can't continue another project's conversation: 404, nothing saved or counted, no model call", async () => {
    const theirs = await (await chat({ key: "pk_other", visitorId: "v_9", message: "Hi" })).json();
    vi.clearAllMocks();
    const before = (await usage(shop.id)).messagesUsed;

    const res = await ask("Show me this thread", { conversationId: theirs.conversationId });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Conversation not found." } });
    expect(await thread(theirs.conversationId)).toHaveLength(2);
    expect((await usage(shop.id)).messagesUsed).toBe(before);
    expect(ai.create).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown conversationId", async () => {
    expect((await ask("Hi", { conversationId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
  });

  it("returns 404 for an unknown key", async () => {
    const res = await chat({ key: "pk_missing", visitorId: "v_1", message: "Hi" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Widget not found." } });
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["a missing message", { key: "pk_shop", visitorId: "v_1" }],
    ["a message over 1,000 characters", { key: "pk_shop", visitorId: "v_1", message: "x".repeat(1001) }],
    ["a malformed key", { key: "shop", visitorId: "v_1", message: "Hi" }],
    ["a non-uuid conversationId", { key: "pk_shop", visitorId: "v_1", message: "Hi", conversationId: "abc" }],
  ])("returns 400 for %s, with CORS", async (_label, body) => {
    const res = await chat(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("request size (M1)", () => {
  it("returns 413 for a body over 16 KB, with CORS, before any lookup or model call", async () => {
    const res = await ask("x".repeat(20 * 1024));
    expect(res.status).toBe(413);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect((await res.json()).error.code).toBe("invalid_input");
    expect(arcjet.protect).not.toHaveBeenCalled();
    expect(ai.embedQuery).not.toHaveBeenCalled();
  });

  it("returns 413 on an oversized Content-Length without reading the body", async () => {
    const res = await POST(
      new Request("https://app.test/api/widget/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": String(50 * 1024 * 1024) },
        body: JSON.stringify({ key: "pk_shop", visitorId: "v_1", message: "hi" }),
      }),
    );
    expect(res.status).toBe(413);
  });
});

describe("production without ARCJET_KEY (M3)", () => {
  it("returns 503 service_unavailable with CORS, before the limiter, the lookup or the model", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ARCJET_KEY", "");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await ask("How fast do you ship?");
    expect(res.status).toBe(503);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ error: { code: "service_unavailable", message: "Chat is unavailable right now." } });
    expect(arcjet.protect).not.toHaveBeenCalled();
    expect(ai.embedQuery).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("serves chat in production when the key is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await ask("How fast do you ship?")).status).toBe(200);
  });

  it("still fails open outside production (local dev without a key)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ARCJET_KEY", "");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await ask("How fast do you ship?")).status).toBe(200);
    logged.mockRestore();
  });
});

describe("rate limit", () => {
  it("returns 429 rate_limited with Retry-After on a denied decision, before any lookup or model call", async () => {
    arcjet.conclusion = "DENY";
    const before = (await usage(shop.id)).messagesUsed;

    const res = await ask("Hi");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("33");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect((await res.json()).error.code).toBe("rate_limited");
    expect(ai.embedQuery).not.toHaveBeenCalled();
    expect((await usage(shop.id)).messagesUsed).toBe(before);
  });

  it("limits per public key and client IP on the widgetChat rule", async () => {
    await ask("Hi");
    expect(arcjet.protect).toHaveBeenCalledWith(expect.any(Request), {
      route: "widgetChat",
      publicKey: "pk_shop",
      clientIp: "203.0.113.9",
    });
  });

  it("lets the message through when Arcjet errors", async () => {
    arcjet.conclusion = "ERROR";
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await ask("How fast do you ship?")).status).toBe(200);
    logged.mockRestore();
  });
});

describe("monthly quota", () => {
  const freeLimit = PLAN_LIMITS.free.messagesPerMonth;

  it("allows a Free project's 100th message and refuses the 101st with 429 quota_exceeded", async () => {
    await setUsage(shop.id, freeLimit - 1);
    expect((await ask("How fast do you ship?")).status).toBe(200);
    expect((await usage(shop.id)).messagesUsed).toBe(freeLimit);

    const res = await ask("One more?");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: { code: "quota_exceeded", message: "This chat has reached its monthly message limit." },
    });
    expect(res.headers.get("Retry-After")).toBeNull();
    expect(ai.embedQuery).toHaveBeenCalledTimes(1);
    expect((await usage(shop.id)).messagesUsed).toBe(freeLimit);
  });

  it("doesn't overshoot when a concurrent request takes the last message while the model answers", async () => {
    await setUsage(shop.id, freeLimit - 1);
    ai.create.mockImplementationOnce(async () => {
      // Another request for this project is counted while this one waits on the model.
      await setUsage(shop.id, freeLimit);
      return { output_text: "We ship worldwide.", model: "gpt-test", usage: { input_tokens: 1, output_tokens: 1 } };
    });
    const conversationsBefore = (await db.select().from(conversations)).length;

    const res = await ask("How fast do you ship?");
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("quota_exceeded");
    expect((await usage(shop.id)).messagesUsed).toBe(freeLimit);
    expect((await db.select().from(conversations)).length).toBe(conversationsBefore);
  });

  it("reads the plan on the server: a Pro project is past the Free limit", async () => {
    await setUsage(other.id, freeLimit);
    expect((await chat({ key: "pk_other", visitorId: "v_3", message: "Hi" })).status).toBe(200);
  });

  it("starts a new period once period_start is over a month old", async () => {
    const twoMonthsAgo = new Date(Date.now() - 62 * 24 * 60 * 60 * 1000);
    await setUsage(shop.id, freeLimit, twoMonthsAgo);

    expect((await ask("How fast do you ship?")).status).toBe(200);
    const after = await usage(shop.id);
    expect(after.messagesUsed).toBe(1);
    expect(after.periodStart.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("resets a period_start the database wrote itself (microsecond precision)", async () => {
    await db
      .update(projects)
      .set({ messagesUsed: freeLimit, periodStart: sql`now() - interval '62 days' + interval '123 microseconds'` })
      .where(eq(projects.id, shop.id));

    expect((await ask("How fast do you ship?")).status).toBe(200);
    expect((await usage(shop.id)).messagesUsed).toBe(1);
  });
});

describe("failures", () => {
  it("returns 500 without details, and saves and counts nothing, when OpenAI fails", async () => {
    await setUsage(shop.id, 0);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    ai.create.mockRejectedValueOnce(new Error("OpenAI is down: system prompt was ..."));
    const conversationsBefore = (await db.select().from(conversations)).length;

    const res = await ask("How fast do you ship?");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong. Try again." } });
    expect((await db.select().from(conversations)).length).toBe(conversationsBefore);
    expect((await usage(shop.id)).messagesUsed).toBe(0);
    logged.mockRestore();
  });
});

describe("OPTIONS /api/widget/chat", () => {
  it("answers the CORS preflight", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});

describe("PostHog: first_chat and the AI trace", () => {
  type Captured = { distinctId: string; event: string; properties: Record<string, unknown> };
  const captured = (event: string) =>
    posthog.capture.mock.calls.map(([call]) => call as Captured).filter((call) => call.event === event);

  let seq = 0;
  async function freshProject(withChunk = true) {
    const publicKey = `pk_fresh${++seq}`;
    const project = await seedProject(db, { plan: "pro", publicKey });
    if (withChunk) await seedChunk(project.id, "We ship worldwide within 5 business days.", 0);
    return { ...project, publicKey, ownerId: `user_${publicKey}` };
  }
  const send = (publicKey: string, extra: Record<string, unknown> = {}) =>
    chat({ key: publicKey, visitorId: "v_ph", message: "How fast do you ship?", ...extra });

  it("sends first_chat once, as the owner, when the project's first conversation is saved", async () => {
    const project = await freshProject();
    const first = await (await send(project.publicKey)).json();
    await send(project.publicKey, { conversationId: first.conversationId }); // same conversation
    await send(project.publicKey); // a second conversation

    expect(captured("first_chat")).toEqual([
      { distinctId: project.ownerId, event: "first_chat", properties: { project_id: project.id } },
    ]);
  });

  it("sends first_chat once when a project's first chats arrive at the same time", async () => {
    const project = await freshProject();
    const results = await Promise.all([1, 2, 3].map((n) => send(project.publicKey, { visitorId: `v_race${n}` })));

    expect(results.map((res) => res.status)).toEqual([200, 200, 200]);
    expect(await db.select().from(conversations).where(eq(conversations.projectId, project.id))).toHaveLength(3);
    expect(captured("first_chat")).toHaveLength(1);
  });

  it("sends one $ai_generation per model reply as the owner, grouped by conversation", async () => {
    const project = await freshProject();
    const first = await (await send(project.publicKey)).json();
    await send(project.publicKey, { conversationId: first.conversationId });

    const generations = captured("$ai_generation");
    expect(generations).toHaveLength(2);
    for (const generation of generations) {
      expect(generation).toEqual({
        distinctId: project.ownerId,
        event: "$ai_generation",
        properties: {
          $ai_model: "gpt-test",
          $ai_provider: "openai",
          $ai_input_tokens: 100,
          $ai_output_tokens: 10,
          $ai_latency: expect.any(Number),
          $ai_trace_id: first.conversationId,
          project_id: project.id,
        },
      });
    }
  });

  it("never sends the visitor's message, the chunks or the reply in any event", async () => {
    const project = await freshProject();
    await chat({ key: project.publicKey, visitorId: "v_private", message: "My order 4471 for jane@example.com is late" });

    const sent = JSON.stringify(posthog.capture.mock.calls);
    for (const text of ["4471", "jane@example.com", "is late", "We ship worldwide", "5 business days", "v_private"]) {
      expect(sent).not.toContain(text);
    }
  });

  it("sends no $ai_generation when the model was skipped (no chunks)", async () => {
    const project = await freshProject(false);
    const body = await (await send(project.publicKey)).json();

    expect(body.reply).toBe(DONT_KNOW_REPLY);
    expect(captured("$ai_generation")).toHaveLength(0);
    expect(captured("first_chat")).toHaveLength(1);
  });

  it("sends nothing when the request is refused", async () => {
    const project = await freshProject();
    await db.update(projects).set({ messagesUsed: PLAN_LIMITS.pro.messagesPerMonth }).where(eq(projects.id, project.id));
    expect((await send(project.publicKey)).status).toBe(429);
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("still returns the reply when the PostHog client throws", async () => {
    const project = await freshProject();
    posthog.capture.mockImplementation(() => {
      throw new Error("PostHog down");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await send(project.publicKey);
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe("We ship worldwide within 5 business days.");
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
    posthog.capture.mockReset();
  });
});
