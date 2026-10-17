// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => vi.fn());
const captureException = vi.hoisted(() => vi.fn());
const constructed = vi.hoisted(() => vi.fn());
vi.mock("posthog-node", () => ({
  PostHog: class {
    capture = capture;
    captureException = captureException;
    constructor(key: string, options: unknown) {
      constructed(key, options);
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
