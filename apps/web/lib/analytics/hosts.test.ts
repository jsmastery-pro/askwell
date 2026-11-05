import { describe, expect, it } from "vitest";
import { browserHosts, ingestRewrites, posthogCloudRegion } from "./hosts";

describe("posthogCloudRegion", () => {
  it("reads US and EU Cloud hosts", () => {
    expect(posthogCloudRegion("https://us.i.posthog.com")).toBe("us");
    expect(posthogCloudRegion("https://eu.i.posthog.com/")).toBe("eu");
  });
  it("is null for other or missing hosts", () => {
    expect(posthogCloudRegion("https://posthog.example.com")).toBeNull();
    expect(posthogCloudRegion("https://us.i.posthog.com.evil.test")).toBeNull();
    expect(posthogCloudRegion(undefined)).toBeNull();
  });
});

describe("ingestRewrites", () => {
  it("proxies assets and ingestion for the host's region", () => {
    expect(ingestRewrites("https://eu.i.posthog.com")).toEqual([
      { source: "/ingest/static/:path*", destination: "https://eu-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/array/:path*", destination: "https://eu-assets.i.posthog.com/array/:path*" },
      { source: "/ingest/:path*", destination: "https://eu.i.posthog.com/:path*" },
    ]);
  });
  it("adds nothing for a non-Cloud host", () => {
    expect(ingestRewrites("https://posthog.example.com")).toEqual([]);
    expect(ingestRewrites(undefined)).toEqual([]);
  });
});

describe("browserHosts", () => {
  it("sends Cloud traffic through /ingest, with the app as ui_host", () => {
    expect(browserHosts("https://us.i.posthog.com")).toEqual({
      api_host: "/ingest",
      ui_host: "https://us.posthog.com",
    });
  });
  it("uses any other host directly", () => {
    expect(browserHosts("https://posthog.example.com")).toEqual({ api_host: "https://posthog.example.com" });
  });
});
