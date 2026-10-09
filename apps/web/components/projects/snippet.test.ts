import { describe, expect, it } from "vitest";
import { buildInstallSnippet, resolveAppUrl } from "./snippet";

describe("buildInstallSnippet", () => {
  it("builds the script tag for a key and URL", () => {
    expect(buildInstallSnippet("https://askwell.example", "pk_abc123")).toBe(
      '<script src="https://askwell.example/widget.js" data-key="pk_abc123"></script>',
    );
  });

  it("drops trailing slashes from the URL", () => {
    expect(buildInstallSnippet("https://askwell.example//", "pk_abc")).toBe(
      '<script src="https://askwell.example/widget.js" data-key="pk_abc"></script>',
    );
  });
});

describe("resolveAppUrl", () => {
  it("uses NEXT_PUBLIC_APP_URL when set", () => {
    expect(resolveAppUrl(new Headers({ host: "other.test" }), { NEXT_PUBLIC_APP_URL: "https://app.test" })).toBe(
      "https://app.test",
    );
  });

  it("falls back to the request's forwarded origin", () => {
    const headers = new Headers({ "x-forwarded-host": "bob.test", "x-forwarded-proto": "https" });
    expect(resolveAppUrl(headers, {})).toBe("https://bob.test");
  });

  it("uses the first value when proxies send a list", () => {
    const headers = new Headers({ "x-forwarded-host": "bob.test, internal:3000", "x-forwarded-proto": "https, http" });
    expect(resolveAppUrl(headers, {})).toBe("https://bob.test");
  });

  it("uses http for localhost", () => {
    expect(resolveAppUrl(new Headers({ host: "localhost:3000" }), {})).toBe("http://localhost:3000");
  });
});
