import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  on: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: posthog }));

const fetchMock = vi.fn();

// The module starts PostHog as a side effect of loading, so each case loads it fresh at a given URL.
async function loadAt(path: string, config: { key: string | null; host?: string } | "error") {
  window.history.pushState({}, "", path);
  fetchMock.mockResolvedValue(
    config === "error"
      ? { ok: false, json: async () => ({}) }
      : { ok: true, json: async () => ({ host: "https://us.i.posthog.com", ...config }) },
  );
  await import("./instrumentation-client");
  // The mocked fetch resolves at once, so the whole init chain settles before the next macrotask.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.history.pushState({}, "", "/");
});

describe("instrumentation-client", () => {
  it("never loads PostHog on /embed, not even the config request", async () => {
    await loadAt("/embed", { key: "phc_test" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it("stays uninitialized when the server has no key", async () => {
    await loadAt("/", { key: null });
    expect(fetchMock).toHaveBeenCalledWith("/api/posthog-config");
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it("stays uninitialized when the config request fails", async () => {
    await loadAt("/", "error");
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it("initializes through the /ingest proxy with exception capture, recording on the landing page", async () => {
    await loadAt("/", { key: "phc_test" });
    expect(posthog.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        api_host: "/ingest",
        ui_host: "https://us.posthog.com",
        capture_exceptions: true,
        disable_session_recording: false,
      }),
    );
  });

  it("starts with replay off outside the landing page and dashboard", async () => {
    await loadAt("/sign-in", { key: "phc_test" });
    expect(posthog.init).toHaveBeenCalledWith("phc_test", expect.objectContaining({ disable_session_recording: true }));
  });

  it("turns replay on and off as client-side navigation crosses those boundaries", async () => {
    await loadAt("/sign-in", { key: "phc_test" });
    const [eventName, onEvent] = posthog.on.mock.calls[0]!;
    expect(eventName).toBe("eventCaptured");

    window.history.pushState({}, "", "/dashboard/projects");
    onEvent({ event: "$pageview" });
    expect(posthog.startSessionRecording).toHaveBeenCalledOnce();

    window.history.pushState({}, "", "/sign-up");
    onEvent({ event: "$pageview" });
    expect(posthog.stopSessionRecording).toHaveBeenCalledOnce();

    onEvent({ event: "snippet_copied" });
    expect(posthog.startSessionRecording).toHaveBeenCalledOnce();
    expect(posthog.stopSessionRecording).toHaveBeenCalledOnce();
  });
});
