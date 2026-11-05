import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveWidgetConfig } from "./api";

const CONFIG = { project_id: "p1", ...DEFAULT_WIDGET_CONFIG, button_color: "#e11d48" };
const respond = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(body, { status })));

afterEach(() => vi.unstubAllGlobals());

describe("saveWidgetConfig", () => {
  it("PATCHes only the given fields to the project's config route and returns the stored config", async () => {
    respond(200, { config: CONFIG });
    expect(await saveWidgetConfig("p1", { button_color: "#e11d48" })).toEqual({ ok: true, data: CONFIG });
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe("/api/projects/p1/config");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ button_color: "#e11d48" });
  });

  it("402 → payment_required", async () => {
    respond(402, { error: { code: "payment_required", message: "Pro only." } });
    expect(await saveWidgetConfig("p1", { label: "Hi" })).toEqual({
      ok: false,
      error: { code: "payment_required", message: "Pro only." },
    });
  });

  it("500 → internal with the route's message", async () => {
    respond(500, { error: { code: "internal", message: "Something went wrong. Try again." } });
    const result = await saveWidgetConfig("p1", { label: "Hi" });
    expect(result).toEqual({ ok: false, error: { code: "internal", message: "Something went wrong. Try again." } });
  });

  it("an unexpected success body is an error, never ok", async () => {
    respond(200, { nope: true });
    expect((await saveWidgetConfig("p1", { label: "Hi" })).ok).toBe(false);
  });
});
