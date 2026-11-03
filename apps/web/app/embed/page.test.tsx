import { DEFAULT_WIDGET_CONFIG, type WidgetSettings } from "@askwell/shared";
import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The config lookup (A1) is mocked: these tests are about the page.
const getPublicWidgetConfig = vi.fn<(key: string) => Promise<WidgetSettings | null>>();
vi.mock("../../components/embed/widget-config", () => ({
  getPublicWidgetConfig: (key: string) => getPublicWidgetConfig(key),
}));

const { default: EmbedPage } = await import("./page");

beforeEach(() => {
  getPublicWidgetConfig.mockReset();
  getPublicWidgetConfig.mockImplementation(async (key) =>
    key === "pk_test_123" ? { ...DEFAULT_WIDGET_CONFIG } : null,
  );
});

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
    ["an unknown key", { key: "pk_unknown" }],
  ])("shows 'This chat isn't available' for %s", async (_label, params) => {
    const html = await render(params);
    expect(html).toContain("This chat isn&#x27;t available");
    expect(html).not.toContain("<textarea");
  });

  it("doesn't look up a malformed key", async () => {
    await render({ key: "not a key" });
    expect(getPublicWidgetConfig).not.toHaveBeenCalled();
  });

  it("shows 'This chat isn't available' when the lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getPublicWidgetConfig.mockRejectedValue(new Error("database down"));
    const html = await render({ key: "pk_test_123" });
    expect(html).toContain("This chat isn&#x27;t available");
    expect(html).not.toContain("database down");
  });

  it("turns messaging off for a bad origin", async () => {
    const html = await render({ key: "pk_test_123", origin: "*" });
    expect(html).toContain("<textarea");
    expect(html).not.toContain('aria-label="Close chat"');
  });
});
