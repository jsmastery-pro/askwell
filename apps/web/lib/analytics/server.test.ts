import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureImmediate = vi.fn(async (_: unknown) => {});
const captureExceptionImmediate = vi.fn(async (..._: unknown[]) => {});
const PostHog = vi.fn(function (this: object) {
  Object.assign(this, { captureImmediate, captureExceptionImmediate });
});
const after = vi.fn((task: () => Promise<void>) => void task());

vi.mock("server-only", () => ({}));
vi.mock("posthog-node", () => ({ PostHog }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => after(task) }));

const load = async () => {
  vi.resetModules();
  return import("./server");
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("captureServerEvent", () => {
  it("sends the event immediately, scheduled with after()", async () => {
    const { captureServerEvent } = await load();
    captureServerEvent({ distinctId: "user_1", event: "project_created", properties: { plan: "free" } });
    await vi.waitFor(() => expect(captureImmediate).toHaveBeenCalledOnce());
    expect(after).toHaveBeenCalledOnce();
    expect(PostHog).toHaveBeenCalledWith("phc_test", expect.objectContaining({ host: "https://us.i.posthog.com" }));
    expect(captureImmediate).toHaveBeenCalledWith({
      distinctId: "user_1",
      event: "project_created",
      properties: { plan: "free" },
    });
  });

  it("sends at once outside a request, when after() throws", async () => {
    after.mockImplementationOnce(() => {
      throw new Error("after() outside a request scope");
    });
    const { captureServerEvent } = await load();
    expect(() => captureServerEvent({ distinctId: "user_1", event: "e" })).not.toThrow();
    await vi.waitFor(() => expect(captureImmediate).toHaveBeenCalledOnce());
  });

  it("never throws when sending fails", async () => {
    captureImmediate.mockRejectedValueOnce(new Error("network"));
    const { captureServerEvent } = await load();
    expect(() => captureServerEvent({ distinctId: "user_1", event: "e" })).not.toThrow();
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
  });

  it("drops events when PostHog isn't configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { captureServerEvent } = await load();
    captureServerEvent({ distinctId: "user_1", event: "e" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(PostHog).not.toHaveBeenCalled();
    expect(captureImmediate).not.toHaveBeenCalled();
  });
});

describe("captureServerException", () => {
  it("sends the exception with its person and properties", async () => {
    const { captureServerException } = await load();
    const error = new Error("boom");
    await captureServerException(error, "user_1", { path: "/x" });
    expect(captureExceptionImmediate).toHaveBeenCalledWith(error, "user_1", { path: "/x" });
  });

  it("resolves even when sending fails", async () => {
    captureExceptionImmediate.mockRejectedValueOnce(new Error("network"));
    const { captureServerException } = await load();
    await expect(captureServerException(new Error("boom"))).resolves.toBeUndefined();
  });
});
