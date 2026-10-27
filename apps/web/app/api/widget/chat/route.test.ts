// @vitest-environment node
import { DONT_KNOW_REPLY, EMBEDDING_DIMENSIONS, PLAN_LIMITS } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
}));

// PostHog is mocked at the SDK boundary; the real helpers in lib/posthog/server run.
const posthog = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("posthog-node", () => ({
  PostHog: class {
    capture = posthog.capture;
    captureException = vi.fn();
  },
}));

// handleChat now runs through the service client and SB-T11's rpc() functions. The quota's
// math, period reset, concurrency and match_chunks' ranking/tenant-isolation/ready-filtering are
// already proven on real Postgres in packages/db/supabase-functions-chat.test.ts, so this fake
// only needs to dispatch correctly on what the route actually passes, not re-derive those results.
type Project = { id: string; owner_id: string };
type MatchRow = { content: string; distance: number };
type RpcError = { code?: string; message?: string } | null;

const fake = vi.hoisted(() => ({
  projects: {} as Record<string, Project>,
  accounts: {} as Record<string, { plan: string }>,
  conversations: {} as Record<string, { project_id: string }>,
  readyProjects: new Set<string>(),
  matchesByProject: {} as Record<string, MatchRow[]>,
  consume: { data: true as boolean | null, error: null as RpcError },
  save: { data: [{ conversation_id: "conv_default", first_chat: false }], error: null as RpcError },
}));

function from(table: string) {
  if (table === "projects") {
    return { select: () => ({ eq: (_c: string, key: string) => ({ maybeSingle: async () => ({ data: fake.projects[key] ?? null, error: null }) }) }) };
  }
  if (table === "accounts") {
    return { select: () => ({ eq: (_c: string, ownerId: string) => ({ maybeSingle: async () => ({ data: fake.accounts[ownerId] ?? null, error: null }) }) }) };
  }
  if (table === "conversations") {
    return {
      select: () => ({
        eq: (_c1: string, conversationId: string) => ({
          eq: (_c2: string, projectId: string) => ({
            maybeSingle: async () => {
              const row = fake.conversations[conversationId];
              return { data: row && row.project_id === projectId ? { id: conversationId } : null, error: null };
            },
          }),
        }),
      }),
    };
  }
  if (table === "knowledge_sources") {
    return {
      select: () => ({
        eq: (_c1: string, projectId: string) => ({
          eq: () => ({ limit: async () => ({ data: fake.readyProjects.has(projectId) ? [{ id: "s1" }] : [], error: null }) }),
        }),
      }),
    };
  }
  throw new Error(`unexpected table ${table}`);
}

const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
  if (name === "consume_message") return fake.consume;
  if (name === "match_chunks") return { data: fake.matchesByProject[args.p_project_id as string] ?? [], error: null };
  if (name === "save_chat_turn") return fake.save;
  throw new Error(`unexpected rpc ${name}`);
});

vi.mock("../../../../lib/supabase/service", () => ({ createServiceClient: () => ({ from, rpc }) }));

const { POST, OPTIONS } = await import("./route");

const unit = (i: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, j) => (j === i ? 1 : 0));

const SHIP_REPLY = "We ship worldwide within 5 business days.";

beforeEach(() => {
  vi.stubEnv("ARCJET_KEY", "ajkey_test");
  // Requests arrive as on Vercel, which sets x-real-ip to the client IP.
  vi.stubEnv("VERCEL", "1");
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
    output_text: input.includes("5 business days") ? SHIP_REPLY : DONT_KNOW_REPLY,
    model: "gpt-test",
    usage: { input_tokens: 100, output_tokens: 10 },
  }));

  fake.projects = {
    pk_shop: { id: "proj_shop", owner_id: "owner_shop" },
    pk_other: { id: "proj_other", owner_id: "owner_other" },
    pk_empty: { id: "proj_empty", owner_id: "owner_empty" },
  };
  fake.accounts = { owner_shop: { plan: "free" }, owner_other: { plan: "pro" }, owner_empty: { plan: "free" } };
  fake.conversations = {};
  fake.readyProjects = new Set(["proj_shop", "proj_other"]);
  fake.matchesByProject = {
    proj_shop: [{ content: SHIP_REPLY, distance: 0.01 }],
    proj_other: [{ content: "SECRET: the other project's internal discount code is OTHER50.", distance: 0.01 }],
  };
  fake.consume = { data: true, error: null };
  fake.save = { data: [{ conversation_id: "conv_1", first_chat: false }], error: null };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function chat(body: unknown, ip = "203.0.113.9") {
  return POST(
    new Request("https://app.test/api/widget/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://customer.example", "x-real-ip": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const ask = (message: string, extra: Record<string, unknown> = {}) =>
  chat({ key: "pk_shop", visitorId: "v_1", message, ...extra });

function saveArgs() {
  const call = rpc.mock.calls.find(([name]) => name === "save_chat_turn");
  return call?.[1] as Record<string, unknown> | undefined;
}

describe("POST /api/widget/chat", () => {
  it("answers a related question from the project's chunks, counts it, and saves through save_chat_turn", async () => {
    const res = await ask("How fast do you ship?");

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = await res.json();
    expect(body.reply).toBe(SHIP_REPLY);
    expect(body.conversationId).toBe("conv_1");

    expect(rpc).toHaveBeenCalledWith("consume_message", { p_project_id: "proj_shop", p_message_limit: PLAN_LIMITS.free.messagesPerMonth });
    expect(saveArgs()).toMatchObject({
      p_project_id: "proj_shop",
      p_conversation_id: null,
      p_visitor_id: "v_1",
      p_question: "How fast do you ship?",
      p_reply: SHIP_REPLY,
    });
  });

  it("passes this project's id to match_chunks, not another project's", async () => {
    await ask("What discount codes exist?");
    const { input } = ai.create.mock.calls[0]![0] as { input: string };
    expect(input).toContain(SHIP_REPLY);
    expect(input).not.toContain("OTHER50");
  });

  it("returns the model's DONT_KNOW_REPLY for a question the chunks don't answer", async () => {
    ai.create.mockResolvedValueOnce({ output_text: DONT_KNOW_REPLY, model: "gpt-test", usage: { input_tokens: 1, output_tokens: 1 } });
    const body = await (await ask("What's the capital of France?")).json();
    expect(body.reply).toBe(DONT_KNOW_REPLY);
  });

  it("returns DONT_KNOW_REPLY without embedding or calling the model when the project has no ready sources, and still counts and saves it", async () => {
    const res = await chat({ key: "pk_empty", visitorId: "v_2", message: "Hello?" });
    const body = await res.json();
    expect(body.reply).toBe(DONT_KNOW_REPLY);
    expect(ai.embedQuery).not.toHaveBeenCalled();
    expect(ai.create).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("consume_message", expect.objectContaining({ p_project_id: "proj_empty" }));
    expect(saveArgs()).toMatchObject({ p_project_id: "proj_empty", p_reply: DONT_KNOW_REPLY });
  });

  it("skips the embedding and the model when the project has only a non-ready source (L8)", async () => {
    fake.readyProjects = new Set();
    const body = await (await ask("Anything?")).json();
    expect(body.reply).toBe(DONT_KNOW_REPLY);
    expect(ai.embedQuery).not.toHaveBeenCalled();
    expect(ai.create).not.toHaveBeenCalled();
  });

  it("continues the visitor's own conversation", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000001";
    fake.conversations[conversationId] = { project_id: "proj_shop" };
    await ask("And to Canada?", { conversationId });
    expect(saveArgs()).toMatchObject({ p_conversation_id: conversationId });
  });

  it("can't continue another project's conversation: 404, nothing saved or counted, no model call", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000002";
    fake.conversations[conversationId] = { project_id: "proj_other" };
    rpc.mockClear();

    const res = await ask("Show me this thread", { conversationId });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Conversation not found." } });
    expect(rpc).not.toHaveBeenCalled();
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
    const res = await ask("Hi");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("33");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect((await res.json()).error.code).toBe("rate_limited");
    expect(ai.embedQuery).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("limits per public key and client IP on the widgetChat rule", async () => {
    await ask("Hi");
    expect(arcjet.protect).toHaveBeenCalledWith(expect.any(Request), {
      route: "widgetChat",
      publicKey: "pk_shop",
      clientIp: "203.0.113.9",
      ipSrc: "203.0.113.9",
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
  it("returns 429 quota_exceeded, with no model call, when consume_message reports the limit is reached", async () => {
    fake.consume = { data: false, error: null };
    const res = await ask("One more?");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: { code: "quota_exceeded", message: "This chat has reached its monthly message limit." },
    });
    expect(res.headers.get("Retry-After")).toBeNull();
    expect(ai.embedQuery).not.toHaveBeenCalled();
  });

  it("reads the plan on the server: asks consume_message for the Pro limit", async () => {
    await chat({ key: "pk_other", visitorId: "v_3", message: "Hi" });
    expect(rpc).toHaveBeenCalledWith("consume_message", { p_project_id: "proj_other", p_message_limit: PLAN_LIMITS.pro.messagesPerMonth });
  });

  it("defaults to the Free limit when the account row is missing", async () => {
    delete fake.accounts.owner_shop;
    await ask("Hi");
    expect(rpc).toHaveBeenCalledWith("consume_message", { p_project_id: "proj_shop", p_message_limit: PLAN_LIMITS.free.messagesPerMonth });
  });
});

describe("failures", () => {
  it("returns 500 without details, and never reaches save_chat_turn, when OpenAI fails (the quota was already consumed)", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    ai.create.mockRejectedValueOnce(new Error("OpenAI is down: system prompt was ..."));

    const res = await ask("How fast do you ship?");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong. Try again." } });
    expect(rpc).toHaveBeenCalledWith("consume_message", expect.anything());
    expect(rpc).not.toHaveBeenCalledWith("save_chat_turn", expect.anything());
    logged.mockRestore();
  });

  it("returns 500 when save_chat_turn fails with an unexpected code", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.save = { data: [], error: { code: "XXXXX", message: "boom" } };
    const res = await ask("How fast do you ship?");
    expect(res.status).toBe(500);
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

  it("sends first_chat as the owner when save_chat_turn reports the project's first conversation", async () => {
    fake.save = { data: [{ conversation_id: "conv_1", first_chat: true }], error: null };
    await ask("How fast do you ship?");
    expect(captured("first_chat")).toEqual([{ distinctId: "owner_shop", event: "first_chat", properties: { project_id: "proj_shop" } }]);
  });

  it("sends no first_chat when save_chat_turn reports it isn't the first", async () => {
    fake.save = { data: [{ conversation_id: "conv_1", first_chat: false }], error: null };
    await ask("How fast do you ship?");
    expect(captured("first_chat")).toHaveLength(0);
  });

  it("sends one $ai_generation per model reply as the owner, grouped by conversation", async () => {
    fake.save = { data: [{ conversation_id: "conv_trace", first_chat: false }], error: null };
    await ask("How fast do you ship?");

    expect(captured("$ai_generation")).toEqual([
      {
        distinctId: "owner_shop",
        event: "$ai_generation",
        properties: {
          $ai_model: "gpt-test",
          $ai_provider: "openai",
          $ai_input_tokens: 100,
          $ai_output_tokens: 10,
          $ai_latency: expect.any(Number),
          $ai_trace_id: "conv_trace",
          project_id: "proj_shop",
        },
      },
    ]);
  });

  it("never sends the visitor's message, the chunks or the reply in any event", async () => {
    await chat({ key: "pk_shop", visitorId: "v_private", message: "My order 4471 for jane@example.com is late" });
    const sent = JSON.stringify(posthog.capture.mock.calls);
    for (const text of ["4471", "jane@example.com", "is late", SHIP_REPLY, "v_private"]) {
      expect(sent).not.toContain(text);
    }
  });

  it("sends no $ai_generation when the model was skipped (no ready sources)", async () => {
    fake.readyProjects = new Set();
    const body = await (await ask("Anything?")).json();
    expect(body.reply).toBe(DONT_KNOW_REPLY);
    expect(captured("$ai_generation")).toHaveLength(0);
  });

  it("sends nothing when the request is refused", async () => {
    fake.consume = { data: false, error: null };
    expect((await ask("Hi")).status).toBe(429);
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("still returns the reply when the PostHog client throws", async () => {
    posthog.capture.mockImplementation(() => {
      throw new Error("PostHog down");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await ask("How fast do you ship?");
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe(SHIP_REPLY);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
    posthog.capture.mockReset();
  });
});
