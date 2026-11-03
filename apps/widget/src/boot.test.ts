import { describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_CONFIG } from "../../../packages/shared/src/index";
import { boot, NOT_SHOWN, type BootDeps, type ScriptInfo } from "./boot";

const SCRIPT: ScriptInfo = { src: "https://app.example/widget.js", key: "pk_test_1" };

function deps(response: () => Promise<Response>) {
  return {
    fetch: vi.fn(response),
    mount: vi.fn<BootDeps["mount"]>(),
    warn: vi.fn<BootDeps["warn"]>(),
  };
}

const json = (body: unknown, status = 200) =>
  async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("boot", () => {
  it("mounts with the config, the script's origin and the key", async () => {
    const d = deps(json({ config: DEFAULT_WIDGET_CONFIG }));
    await expect(boot(SCRIPT, d)).resolves.toBe(true);
    expect(d.mount).toHaveBeenCalledExactlyOnceWith(DEFAULT_WIDGET_CONFIG, "https://app.example", "pk_test_1");
    expect(d.warn).not.toHaveBeenCalled();
  });

  it.each<[string, ScriptInfo | null]>([
    ["no script tag", null],
    ["no data-key", { src: SCRIPT.src, key: null }],
    ["a malformed key", { src: SCRIPT.src, key: "not-a-key" }],
    ["no src", { src: null, key: "pk_test_1" }],
  ])("renders nothing and fetches nothing with %s", async (_label, script) => {
    const d = deps(json({ config: DEFAULT_WIDGET_CONFIG }));
    await expect(boot(script, d)).resolves.toBe(false);
    expect(d.fetch).not.toHaveBeenCalled();
    expect(d.mount).not.toHaveBeenCalled();
    expect(d.warn).toHaveBeenCalledExactlyOnceWith(NOT_SHOWN);
  });

  it.each<[string, () => Promise<Response>]>([
    ["an unknown key (404)", json({ error: { code: "not_found", message: "No widget uses this key." } }, 404)],
    ["a server error (500)", json({ error: { code: "internal", message: "x" } }, 500)],
    ["a bad config", json({ config: { ...DEFAULT_WIDGET_CONFIG, position: "middle" } })],
    ["a network error", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("renders nothing for %s, with one warning", async (_label, response) => {
    const d = deps(response);
    await expect(boot(SCRIPT, d)).resolves.toBe(false);
    expect(d.mount).not.toHaveBeenCalled();
    expect(d.warn).toHaveBeenCalledExactlyOnceWith(NOT_SHOWN);
  });
});
