import { WIDGET_DEFAULTS } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveWidgetConfig } from "./config-actions";

const fetchMock = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe("saveWidgetConfig", () => {
  it("PATCHes the project's config route with only the changed fields", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ config: WIDGET_DEFAULTS }));

    await saveWidgetConfig("p1", WIDGET_DEFAULTS, { position: "top-right", label: null });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: "top-right", label: null }),
    });
  });

  it("returns the saved config on success", async () => {
    const config = { ...WIDGET_DEFAULTS, label: "Ask us anything" };
    fetchMock.mockResolvedValue(jsonResponse({ config }));

    const result = await saveWidgetConfig("p1", WIDGET_DEFAULTS, { label: "Ask us anything" });

    expect(result).toEqual({ config });
  });

  it("throws the server's error message on failure (e.g. 402 on Free)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "payment_required", message: "Upgrade to Pro." } }, false));

    await expect(saveWidgetConfig("p1", WIDGET_DEFAULTS, { label: "x" })).rejects.toThrow("Upgrade to Pro.");
  });

  it("throws a generic message when the error body can't be read", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => { throw new Error("bad json"); } } as unknown as Response);
    await expect(saveWidgetConfig("p1", WIDGET_DEFAULTS, { label: "x" })).rejects.toThrow("Request failed.");
  });
});
