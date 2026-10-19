// @vitest-environment node
import { describe, expect, it } from "vitest";
// The function Next's build uses to turn a `headers()` source into the regex it matches.
import { buildCustomRoute } from "next/dist/lib/build-custom-route";
import nextConfig from "./next.config";

async function headersFor(path: string): Promise<Record<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const applied: Record<string, string> = {};
  for (const rule of rules) {
    const { regex } = buildCustomRoute("header", rule) as { regex: string };
    if (new RegExp(regex).test(path)) for (const { key, value } of rule.headers) applied[key] = value;
  }
  return applied;
}

describe("frame headers (§9 Clickjacking)", () => {
  it("lets any site frame exactly /embed", async () => {
    expect(await headersFor("/embed")).toEqual({ "Content-Security-Policy": "frame-ancestors *" });
  });

  it.each(["/embed/", "/embed/anything", "/embed/a/b", "/embedded", "/", "/dashboard", "/sign-in", "/api/widget/config"])(
    "keeps %s same-origin only",
    async (path) => {
      expect(await headersFor(path)).toMatchObject({
        "Content-Security-Policy": "frame-ancestors 'self'",
        "X-Frame-Options": "SAMEORIGIN",
      });
    },
  );
});
