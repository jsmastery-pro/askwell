import { afterEach, describe, expect, it, vi } from "vitest";
import { posthogServerEnv } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("posthogServerEnv", () => {
  it("reads the key and host from the environment on each call", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_a");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    expect(posthogServerEnv()).toEqual({ key: "phc_a", host: "https://eu.i.posthog.com" });
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_b");
    expect(posthogServerEnv()?.key).toBe("phc_b");
  });

  it("is null when either is missing or empty", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_a");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    expect(posthogServerEnv()).toBeNull();
  });
});
