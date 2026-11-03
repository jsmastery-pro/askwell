import { describe, expect, it, vi } from "vitest";
// Relative path: apps/widget doesn't depend on @askwell/shared at runtime.
import {
  DEFAULT_WIDGET_CONFIG,
  PUBLIC_KEY_MAX_LENGTH as SHARED_KEY_MAX,
  WIDGET_ANIMATIONS,
  WIDGET_HEADER_TEXT_MAX_LENGTH,
  WIDGET_LABEL_MAX_LENGTH,
  WIDGET_POSITIONS,
  publicKeySchema,
} from "../../../packages/shared/src/index";
import {
  ANIMATIONS,
  HEADER_TEXT_MAX_LENGTH,
  LABEL_MAX_LENGTH,
  POSITIONS,
  PUBLIC_KEY_MAX_LENGTH,
  baseOriginOf,
  embedUrl,
  fetchConfig,
  isPublicKey,
  parseConfigResponse,
} from "./config";

const BASE = "https://app.example";
const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("constants mirror packages/shared", () => {
  it("match", () => {
    expect(POSITIONS).toEqual(WIDGET_POSITIONS);
    expect(ANIMATIONS).toEqual(WIDGET_ANIMATIONS);
    expect(PUBLIC_KEY_MAX_LENGTH).toBe(SHARED_KEY_MAX);
    expect(LABEL_MAX_LENGTH).toBe(WIDGET_LABEL_MAX_LENGTH);
    expect(HEADER_TEXT_MAX_LENGTH).toBe(WIDGET_HEADER_TEXT_MAX_LENGTH);
  });
});

describe("isPublicKey", () => {
  it.each([
    "pk_abc",
    "pk_A-b_9",
    "pk_seed_jim_embed_free",
    "pk_" + "a".repeat(125),
    "",
    "pk_",
    "pk abc",
    "sk_abc",
    "pk_<script>",
    "pk_" + "a".repeat(126),
  ])("agrees with publicKeySchema for %j", (key) => {
    expect(isPublicKey(key)).toBe(publicKeySchema.safeParse(key).success);
  });

  it("rejects non-strings", () => {
    expect(isPublicKey(null)).toBe(false);
    expect(isPublicKey(undefined)).toBe(false);
  });
});

describe("baseOriginOf", () => {
  it("is the script's origin", () => {
    expect(baseOriginOf("https://app.example/widget.js")).toBe("https://app.example");
    expect(baseOriginOf("http://localhost:3000/widget.js?v=2")).toBe("http://localhost:3000");
  });

  it("is null without a usable src", () => {
    for (const src of [null, undefined, "", "widget.js", "javascript:alert(1)", "data:text/js,1", "file:///w.js"]) {
      expect(baseOriginOf(src)).toBeNull();
    }
  });
});

describe("parseConfigResponse", () => {
  it("accepts the route's { config }", () => {
    expect(parseConfigResponse({ config: DEFAULT_WIDGET_CONFIG })).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it.each([
    ["no body", null],
    ["an error body", { error: { code: "not_found", message: "No widget uses this key." } }],
    ["a bare config", DEFAULT_WIDGET_CONFIG],
    ["a bad color", { config: { ...DEFAULT_WIDGET_CONFIG, button_color: "red;background:url(x)" } }],
    ["a short color", { config: { ...DEFAULT_WIDGET_CONFIG, button_color: "#fff" } }],
    ["an unknown position", { config: { ...DEFAULT_WIDGET_CONFIG, position: "center" } }],
    ["an unknown animation", { config: { ...DEFAULT_WIDGET_CONFIG, animation: "spin" } }],
    ["an empty label", { config: { ...DEFAULT_WIDGET_CONFIG, label: "  " } }],
    ["a long label", { config: { ...DEFAULT_WIDGET_CONFIG, label: "x".repeat(41) } }],
    ["a non-string header", { config: { ...DEFAULT_WIDGET_CONFIG, header_text: 1 } }],
    ["a non-boolean badge", { config: { ...DEFAULT_WIDGET_CONFIG, show_badge: "yes" } }],
  ])("rejects %s", (_label, body) => {
    expect(parseConfigResponse(body)).toBeNull();
  });
});

describe("fetchConfig", () => {
  it("fetches the config without credentials", async () => {
    const fetchMock = vi.fn(async () => ok({ config: DEFAULT_WIDGET_CONFIG }));
    await expect(fetchConfig(BASE, "pk_a-b", fetchMock)).resolves.toEqual(DEFAULT_WIDGET_CONFIG);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${BASE}/api/widget/config?key=pk_a-b`, {
      credentials: "omit",
    });
  });

  it.each([
    ["a 404", async () => ok({ error: { code: "not_found", message: "x" } }, 404)],
    ["a 500", async () => ok({ error: { code: "internal", message: "x" } }, 500)],
    ["a 204", async () => new Response(null, { status: 204 })],
    ["bad JSON", async () => new Response("<html>", { status: 200 })],
    ["a network error", async () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("is null for %s", async (_label, impl) => {
    await expect(fetchConfig(BASE, "pk_a", vi.fn(impl))).resolves.toBeNull();
  });
});

describe("embedUrl", () => {
  it("carries the key and the host origin", () => {
    const url = new URL(embedUrl(BASE, "pk_a-b_1", "http://localhost:8080"));
    expect(url.origin + url.pathname).toBe(`${BASE}/embed`);
    expect(url.searchParams.get("key")).toBe("pk_a-b_1");
    expect(url.searchParams.get("origin")).toBe("http://localhost:8080");
    expect([...url.searchParams.keys()]).toEqual(["key", "origin"]);
  });

  it("encodes both values", () => {
    const url = embedUrl(BASE, "pk_a", "https://h.example&key=pk_evil");
    expect(new URL(url).searchParams.get("key")).toBe("pk_a");
    expect(new URL(url).searchParams.get("origin")).toBe("https://h.example&key=pk_evil");
  });
});
