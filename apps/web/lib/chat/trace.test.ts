import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// after(): queue the work, as Next does until the response is sent.
const pending: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => void pending.push(task) }));
const runAfterResponse = async () => {
  while (pending.length) await pending.shift()?.();
};

const captureServerEvent = vi.fn();
vi.mock("../analytics/server", () => ({ captureServerEvent: (event: unknown) => captureServerEvent(event) }));

// The service client's query result, per table.
const results: Record<string, { data: unknown; error: unknown }> = {};
const queries: { table: string; calls: [string, unknown[]][] }[] = [];
vi.mock("../supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const query = { table, calls: [] as [string, unknown[]][] };
      queries.push(query);
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "limit"]) {
        builder[method] = (...args: unknown[]) => {
          query.calls.push([method, args]);
          return builder;
        };
      }
      builder.maybeSingle = async () => results[table] ?? { data: null, error: null };
      return builder;
    },
  }),
}));

const { reportBlocked, reportNewConversation, traceChat } = await import("./trace");

const TRACE = {
  ownerId: "user_owner",
  projectId: "p1",
  conversationId: "c1",
  visitorId: "v".repeat(32),
  model: "gpt-5-mini-2025-08-07",
  input: [
    { role: "system" as const, content: "You are a support assistant. <knowledge>…</knowledge>" },
    { role: "user" as const, content: "Do you ship to Canada?" },
  ],
  output: "Yes.",
  inputTokens: 300,
  outputTokens: 14,
  latencyMs: 1250,
};

beforeEach(() => {
  pending.length = 0;
  queries.length = 0;
  for (const key of Object.keys(results)) delete results[key];
  captureServerEvent.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("traceChat", () => {
  it("sends one $ai_generation under the owner, traced by the conversation", () => {
    traceChat(TRACE);
    expect(captureServerEvent).toHaveBeenCalledExactlyOnceWith({
      distinctId: "user_owner",
      event: "$ai_generation",
      properties: {
        $ai_trace_id: "c1",
        $ai_span_name: "chat_reply",
        $ai_provider: "openai",
        $ai_model: "gpt-5-mini-2025-08-07",
        $ai_base_url: "https://api.openai.com/v1",
        $ai_http_status: 200,
        $ai_input: TRACE.input,
        $ai_output_choices: [{ role: "assistant", content: "Yes." }],
        $ai_input_tokens: 300,
        $ai_output_tokens: 14,
        $ai_latency: 1.25,
        project_id: "p1",
        conversation_id: "c1",
        visitor_id: TRACE.visitorId,
      },
    });
  });
});

describe("reportNewConversation", () => {
  it("sends first_chat after the response when the conversation is the project's oldest", async () => {
    results.conversations = { data: { id: "c1" }, error: null };
    reportNewConversation("user_owner", "p1", "c1");
    expect(queries).toEqual([]); // nothing before the response
    await runAfterResponse();
    expect(queries[0]?.calls).toEqual([
      ["select", ["id"]],
      ["eq", ["project_id", "p1"]],
      ["order", ["created_at", { ascending: true }]],
      ["order", ["id", { ascending: true }]],
      ["limit", [1]],
    ]);
    expect(captureServerEvent).toHaveBeenCalledExactlyOnceWith({
      distinctId: "user_owner",
      event: "first_chat",
      properties: { project_id: "p1" },
    });
  });

  it("sends nothing when an older conversation exists", async () => {
    results.conversations = { data: { id: "c0" }, error: null };
    reportNewConversation("user_owner", "p1", "c1");
    await runAfterResponse();
    expect(captureServerEvent).not.toHaveBeenCalled();
  });

  it("a failed lookup is logged, never thrown", async () => {
    results.conversations = { data: null, error: new Error("db down") };
    reportNewConversation("user_owner", "p1", "c1");
    await expect(runAfterResponse()).resolves.toBeUndefined();
    expect(captureServerEvent).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("reportBlocked", () => {
  it.each([
    ["rate_limit", "rate_limit"],
    ["injection", "prompt_injection"],
  ] as const)("%s → message_blocked reason %s, under the key's owner, after the response", async (reason, sent) => {
    results.projects = { data: { id: "p1", owner_id: "user_owner" }, error: null };
    reportBlocked("pk_abc", reason);
    expect(queries).toEqual([]);
    await runAfterResponse();
    expect(queries[0]?.calls).toEqual([
      ["select", ["id, owner_id"]],
      ["eq", ["public_key", "pk_abc"]],
    ]);
    expect(captureServerEvent).toHaveBeenCalledExactlyOnceWith({
      distinctId: "user_owner",
      event: "message_blocked",
      properties: { project_id: "p1", reason: sent },
    });
  });

  it("sends nothing for an unknown key, and never throws on a failed lookup", async () => {
    reportBlocked("pk_unknown", "rate_limit");
    await runAfterResponse();
    results.projects = { data: null, error: new Error("db down") };
    reportBlocked("pk_abc", "injection");
    await expect(runAfterResponse()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledOnce();
    expect(captureServerEvent).not.toHaveBeenCalled();
  });
});
