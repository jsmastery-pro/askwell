// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const after = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after }));

const capture = vi.hoisted(() => vi.fn());
const captureException = vi.hoisted(() => vi.fn());
const constructed = vi.hoisted(() => vi.fn());
vi.mock("posthog-node", () => ({
  // Mirrors posthog-node's real flushAt: 1 behavior enough to test it: a capture call also
  // invokes the client's own `waitUntil` option with the (fake) flush promise, wrapped in its
  // own try/catch — exactly as the real client does (waitUntil may throw outside a request scope).
  PostHog: class {
    #waitUntil: ((promise: Promise<unknown>) => void) | undefined;
    constructor(key: string, options: { waitUntil?: (promise: Promise<unknown>) => void }) {
      constructed(key, options);
      this.#waitUntil = options.waitUntil;
    }
    #callWaitUntil() {
      try {
        this.#waitUntil?.(Promise.resolve());
      } catch {
        // Same as posthog-node's own client: waitUntil may throw outside a request scope.
      }
    }
    capture(...args: unknown[]) {
      capture(...args);
      this.#callWaitUntil();
    }
    captureException(...args: unknown[]) {
      captureException(...args);
      this.#callWaitUntil();
    }
  },
}));

// The client is cached per module, so each test loads a fresh copy under its own env.
const load = () => import("./server");

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("without NEXT_PUBLIC_POSTHOG_KEY", () => {
  it("never creates a client, and capture calls are silent no-ops", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { captureServerEvent, captureServerException } = await load();

    expect(() => captureServerEvent("user_1", "signed_up")).not.toThrow();
    expect(() => captureServerException(new Error("boom"))).not.toThrow();
    expect(constructed).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("reports a null key and the default host from the config", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    const { getPostHogConfig } = await load();
    expect(getPostHogConfig()).toEqual({ key: null, host: "https://us.i.posthog.com" });
  });
});

describe("with NEXT_PUBLIC_POSTHOG_KEY", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
  });

  it("reads the key and host at runtime", async () => {
    const { getPostHogConfig } = await load();
    expect(getPostHogConfig()).toEqual({ key: "phc_test", host: "https://eu.i.posthog.com" });
  });

  it("sends an event with its distinct id and properties, creating the client once", async () => {
    const { captureServerEvent } = await load();
    captureServerEvent("user_1", "project_created", { project_id: "p1" });
    captureServerEvent("user_1", "signed_up");

    expect(constructed).toHaveBeenCalledOnce();
    expect(constructed).toHaveBeenCalledWith("phc_test", expect.objectContaining({ host: "https://eu.i.posthog.com" }));
    expect(capture).toHaveBeenNthCalledWith(1, {
      distinctId: "user_1",
      event: "project_created",
      properties: { project_id: "p1" },
    });
  });

  // So the event's flush survives a serverless function freezing right after the response, without
  // making the caller wait on it (project.md §3 Hosting).
  it("wires the client's flush to Next's after(), so events survive a serverless freeze", async () => {
    const { captureServerEvent } = await load();
    captureServerEvent("user_1", "signed_up");
    expect(after).toHaveBeenCalledOnce();
  });

  // after() throws outside a request scope — e.g. instrumentation.ts's onRequestError. Our hook
  // must let that throw reach posthog-node (not swallow it), which is what actually keeps the
  // capture itself unaffected.
  it("still captures the event when after() throws (no request scope)", async () => {
    after.mockImplementationOnce(() => {
      throw new Error("`after` was called outside a request scope");
    });
    const { captureServerEvent } = await load();

    expect(() => captureServerEvent("user_1", "signed_up")).not.toThrow();
    expect(capture).toHaveBeenCalledWith({ distinctId: "user_1", event: "signed_up", properties: undefined });
  });

  it("forwards exceptions", async () => {
    const { captureServerException } = await load();
    const error = new Error("boom");
    captureServerException(error);
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it("never throws into the caller when PostHog itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    capture.mockImplementation(() => {
      throw new Error("posthog down");
    });
    const { captureServerEvent } = await load();
    expect(() => captureServerEvent("user_1", "upgraded", { plan: "pro" })).not.toThrow();
  });
});

describe("captureAiGeneration", () => {
  const generation = {
    model: "gpt-5.4-mini-2026-03-01",
    inputTokens: 812,
    outputTokens: 64,
    latencyMs: 1830,
    conversationId: "c-1",
    projectId: "p-1",
  };

  it("sends one $ai_generation as the owner, with counts and timings only", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const { captureAiGeneration } = await load();

    captureAiGeneration("user_owner", generation);

    expect(capture).toHaveBeenCalledExactlyOnceWith({
      distinctId: "user_owner",
      event: "$ai_generation",
      properties: {
        $ai_model: "gpt-5.4-mini-2026-03-01",
        $ai_provider: "openai",
        $ai_input_tokens: 812,
        $ai_output_tokens: 64,
        $ai_latency: 1.83,
        $ai_trace_id: "c-1",
        project_id: "p-1",
      },
    });
  });

  it("is a no-op without a key", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { captureAiGeneration } = await load();
    captureAiGeneration("user_owner", generation);
    expect(capture).not.toHaveBeenCalled();
  });

  it("never throws when the client does", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    capture.mockImplementationOnce(() => {
      throw new Error("PostHog down");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { captureAiGeneration } = await load();

    expect(() => captureAiGeneration("user_owner", generation)).not.toThrow();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
