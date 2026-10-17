// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const { GET } = await import("./route");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/posthog-config", () => {
  it("serves the runtime key and host, cached briefly", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_runtime");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");

    const res = GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(await res.json()).toEqual({ key: "phc_runtime", host: "https://us.i.posthog.com" });
  });

  it("returns a null key when PostHog isn't configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    expect((await GET().json()).key).toBeNull();
  });
});
