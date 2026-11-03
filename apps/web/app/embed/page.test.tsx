import { prerender } from "react-dom/static";
import { describe, expect, it } from "vitest";
import EmbedPage from "./page";

async function render(params: Record<string, string | string[]>) {
  const { prelude } = await prerender(<EmbedPage params={Promise.resolve({})} searchParams={Promise.resolve(params)} />);
  return new Response(prelude).text();
}

describe("/embed", () => {
  it("shows the panel for a valid key", async () => {
    const html = await render({ key: "pk_test_123", origin: "http://localhost:8080" });
    expect(html).toContain("Ask us anything");
    expect(html).toContain("<textarea");
    expect(html).toContain('aria-label="Close chat"');
    expect(html).not.toContain("This chat isn");
  });

  it.each([
    ["no key", {}],
    ["a bad key", { key: "bad" }],
    ["a key with HTML", { key: "pk_<script>" }],
    ["two keys", { key: ["pk_a", "pk_b"] }],
  ])("shows 'This chat isn't available' for %s", async (_label, params) => {
    const html = await render(params);
    expect(html).toContain("This chat isn&#x27;t available");
    expect(html).not.toContain("<textarea");
  });

  it("turns messaging off for a bad origin", async () => {
    const html = await render({ key: "pk_test_123", origin: "*" });
    expect(html).toContain("<textarea");
    expect(html).not.toContain('aria-label="Close chat"');
  });
});
