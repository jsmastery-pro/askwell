import { cleanup, render, screen } from "@testing-library/react";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getWidgetConfigByKey } from "../../lib/widget-config";
import EmbedPage from "./page";
import { parentOriginFrom } from "./parent-origin";

vi.mock("../../lib/widget-config", () => ({ getWidgetConfigByKey: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(getWidgetConfigByKey).mockReset();
});

async function renderPage(params: { key?: string; origin?: string }) {
  render(await EmbedPage({ searchParams: Promise.resolve(params) }));
}

describe("EmbedPage", () => {
  it("renders the panel for a known key", async () => {
    vi.mocked(getWidgetConfigByKey).mockResolvedValue({ ...DEFAULT_WIDGET_CONFIG, headerText: "Ask Acme" });

    await renderPage({ key: "pk_known", origin: "https://customer.example" });

    expect(getWidgetConfigByKey).toHaveBeenCalledWith("pk_known");
    expect(screen.getByRole("heading", { name: "Ask Acme" })).toBeTruthy();
  });

  it("shows the unavailable state for an unknown key", async () => {
    vi.mocked(getWidgetConfigByKey).mockResolvedValue(null);

    await renderPage({ key: "pk_unknown" });

    expect(screen.getByText("Chat is unavailable right now.")).toBeTruthy();
  });

  it("rejects a malformed key without touching the database", async () => {
    await renderPage({ key: "not-a-key" });

    expect(getWidgetConfigByKey).not.toHaveBeenCalled();
    expect(screen.getByText("Chat is unavailable right now.")).toBeTruthy();
  });

  it("shows the unavailable state when the lookup fails", async () => {
    vi.mocked(getWidgetConfigByKey).mockRejectedValue(new Error("db down"));

    await renderPage({ key: "pk_known" });

    expect(screen.getByText("Chat is unavailable right now.")).toBeTruthy();
  });
});

describe("parentOriginFrom", () => {
  it("keeps only the origin of an http(s) URL", () => {
    expect(parentOriginFrom("https://customer.example/pricing?x=1")).toBe("https://customer.example");
    expect(parentOriginFrom("http://localhost:5500")).toBe("http://localhost:5500");
  });

  it("rejects anything else", () => {
    expect(parentOriginFrom("javascript:alert(1)")).toBeNull();
    expect(parentOriginFrom("*")).toBeNull();
    expect(parentOriginFrom(["https://a.example"])).toBeNull();
    expect(parentOriginFrom(undefined)).toBeNull();
  });
});
