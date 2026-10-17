import { updateWidgetConfigResponseSchema, WIDGET_DEFAULTS } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { MOCK_THREADS } from "../mock/conversations";
import { saveWidgetConfig } from "./config-actions";

vi.mock("server-only", () => ({}));
vi.mock("./demo", () => ({ demoDelay: async () => {} }));

const PROJECT = "11111111-2222-4333-8444-555555555555";

describe("mock reads match their shared schemas", () => {
  it("includes HTML-looking text so screens prove they render it as text", () => {
    const bodies = MOCK_THREADS.flatMap((t) => t.messages.map((m) => m.body));
    expect(bodies.some((body) => /<[a-z]/i.test(body))).toBe(true);
  });
});

describe("mock writes match their shared schemas", () => {
  it("config save, including null resetting a field to its default", async () => {
    const current = { ...WIDGET_DEFAULTS, label: "Ask us" };
    const saved = await saveWidgetConfig(PROJECT, current, { label: null, position: "top-left" });
    updateWidgetConfigResponseSchema.parse(saved);
    expect(saved.config.label).toBe(WIDGET_DEFAULTS.label);
    expect(saved.config.position).toBe("top-left");
  });
});
