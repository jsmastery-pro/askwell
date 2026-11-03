import { describe, expect, it } from "vitest";
import { installSnippet, requestOrigin, resolveAppUrl } from "./snippet";

const headers = (values: Record<string, string>) => new Headers(values);

describe("requestOrigin", () => {
  it("uses x-forwarded-host and x-forwarded-proto (Vercel)", () => {
    expect(
      requestOrigin(
        headers({
          host: "internal:3000",
          "x-forwarded-host": "askwell-git-x-javascriptmastery.vercel.app",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://askwell-git-x-javascriptmastery.vercel.app");
  });

  it("falls back to host, and to https when no scheme is forwarded", () => {
    expect(requestOrigin(headers({ host: "example.com" }))).toBe("https://example.com");
  });

  it("keeps http for local dev and keeps the port", () => {
    expect(requestOrigin(headers({ host: "localhost:3000", "x-forwarded-proto": "http" }))).toBe(
      "http://localhost:3000",
    );
  });

  it("takes the first value of a comma-separated forwarded list", () => {
    expect(
      requestOrigin(headers({ "x-forwarded-host": "a.example.com, b.example.com", "x-forwarded-proto": "https,http" })),
    ).toBe("https://a.example.com");
  });

  it("ignores a forwarded scheme that isn't http(s)", () => {
    expect(requestOrigin(headers({ host: "example.com", "x-forwarded-proto": "javascript" }))).toBe(
      "https://example.com",
    );
  });

  it("returns null without a usable host", () => {
    expect(requestOrigin(headers({}))).toBeNull();
    expect(requestOrigin(headers({ host: "bad host with spaces" }))).toBeNull();
  });
});

describe("resolveAppUrl", () => {
  it("uses NEXT_PUBLIC_APP_URL when it's set, as an origin without a trailing slash", () => {
    expect(resolveAppUrl("https://askwell.example.com/", "https://preview.vercel.app")).toBe(
      "https://askwell.example.com",
    );
    expect(resolveAppUrl("http://localhost:3000", null)).toBe("http://localhost:3000");
  });

  it("uses the request's origin when NEXT_PUBLIC_APP_URL isn't set (Vercel previews)", () => {
    expect(resolveAppUrl(undefined, "https://preview.vercel.app")).toBe("https://preview.vercel.app");
    expect(resolveAppUrl("", "https://preview.vercel.app")).toBe("https://preview.vercel.app");
    expect(resolveAppUrl("   ", "https://preview.vercel.app")).toBe("https://preview.vercel.app");
  });

  it("ignores an invalid NEXT_PUBLIC_APP_URL and uses the request's origin", () => {
    expect(resolveAppUrl("not a url", "https://preview.vercel.app")).toBe("https://preview.vercel.app");
    expect(resolveAppUrl("ftp://files.example.com", "https://preview.vercel.app")).toBe(
      "https://preview.vercel.app",
    );
  });

  it("throws when neither is usable", () => {
    expect(() => resolveAppUrl(undefined, null)).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});

describe("installSnippet", () => {
  it("builds the script tag with the app URL and the project's key", () => {
    expect(installSnippet("https://askwell.example.com", "pk_abc123")).toBe(
      '<script src="https://askwell.example.com/widget.js" data-key="pk_abc123" async></script>',
    );
  });
});
