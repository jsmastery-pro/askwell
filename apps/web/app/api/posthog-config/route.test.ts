import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connection = vi.fn(async () => {});
vi.mock("next/server", () => ({ connection: () => connection() }));

const { GET } = await import("./route");

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/posthog-config", () => {
  it("returns the key and host, read at request time and not cached", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    const res = await GET();
    expect(connection).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ key: "phc_test", host: "https://eu.i.posthog.com" });
  });

  it("returns 500 in the §8 error shape when a variable is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Analytics isn't configured." } });
  });
});
