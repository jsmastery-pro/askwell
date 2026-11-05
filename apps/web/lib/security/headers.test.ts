import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { ALL_PATHS, securityHeaderRules, type HeaderRule } from "./headers";

/**
 * The headers a path gets, by matching each rule's source. ALL_PATHS matches
 * everything; ALL_BUT_EMBED is a path-to-regexp source made of one plain regex
 * group, so it compiles as a RegExp the way Next compiles it.
 */
function matches(source: string, path: string): boolean {
  if (source === ALL_PATHS) return true;
  return new RegExp(`^${source}$`).test(path);
}
function headersFor(path: string, rules: HeaderRule[] = securityHeaderRules()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) {
    if (!matches(rule.source, path)) continue;
    for (const { key, value } of rule.headers) out[key] = value;
  }
  return out;
}

const FRAMED_ONLY_BY_US = {
  "Content-Security-Policy": "frame-ancestors 'self'",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

describe("security headers", () => {
  it.each([
    "/",
    "/dashboard",
    "/dashboard/projects/p1/customize",
    "/sign-in",
    "/sign-in/factor-one",
    "/api/projects",
    "/api/widget/config",
    "/embedded",
    "/embeds/x",
    "/x/embed",
  ])("%s may only be framed by this site", (path) => {
    expect(headersFor(path)).toEqual(FRAMED_ONLY_BY_US);
  });

  it.each(["/embed", "/embed/", "/embed/anything"])(
    "%s can be framed by any site, and still gets nosniff + the referrer policy",
    (path) => {
      expect(headersFor(path)).toEqual({
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      });
    },
  );

  it("/widget.js gets no header that would stop a cross-origin script tag", () => {
    const h = headersFor("/widget.js");
    // nosniff is fine: widget.js is served as JavaScript. No CORP / COEP.
    expect(Object.keys(h).sort()).toEqual(Object.keys(FRAMED_ONLY_BY_US).sort());
    expect(Object.keys(h).some((k) => /Cross-Origin|Access-Control/i.test(k))).toBe(false);
  });

  it("is not a full CSP and adds no CORS headers", () => {
    const all = securityHeaderRules().flatMap((r) => r.headers);
    const csp = all.filter((h) => h.key === "Content-Security-Policy").map((h) => h.value);
    expect(csp).toEqual(["frame-ancestors 'self'"]);
    expect(all.some((h) => /^Access-Control-/i.test(h.key))).toBe(false);
  });

  it("next.config serves exactly these rules", async () => {
    expect(await nextConfig.headers?.()).toEqual(securityHeaderRules());
  });

  it("the public widget.js file exists (served from /public, no route in front of it)", () => {
    expect(readFileSync(new URL("../../public/widget.js", import.meta.url), "utf8").length).toBeGreaterThan(0);
  });
});
