import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIDGET_CONFIG,
  apiErrorSchema,
  createProjectRequestSchema,
  updateWidgetConfigRequestSchema,
  widgetChatRequestSchema,
  widgetConfigSchema,
} from "./index";

const chat = { key: "pk_abc123", visitorId: "v1", message: "Hi" };

describe("widgetChatRequestSchema", () => {
  it("accepts a valid message", () => {
    expect(widgetChatRequestSchema.safeParse(chat).success).toBe(true);
  });

  it("rejects messages over 1,000 characters", () => {
    expect(widgetChatRequestSchema.safeParse({ ...chat, message: "a".repeat(1001) }).success).toBe(false);
  });

  it("rejects a key without the pk_ prefix", () => {
    expect(widgetChatRequestSchema.safeParse({ ...chat, key: "abc" }).success).toBe(false);
  });
});

describe("widget config", () => {
  it("default config is valid", () => {
    expect(widgetConfigSchema.safeParse(DEFAULT_WIDGET_CONFIG).success).toBe(true);
  });

  it("update rejects a non-hex color and accepts null to reset", () => {
    expect(updateWidgetConfigRequestSchema.safeParse({ buttonColor: "red" }).success).toBe(false);
    expect(updateWidgetConfigRequestSchema.safeParse({ buttonColor: null }).success).toBe(true);
  });
});

describe("createProjectRequestSchema", () => {
  it("rejects a blank name", () => {
    expect(createProjectRequestSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});

describe("apiErrorSchema", () => {
  it("matches { error: { code, message } }", () => {
    expect(apiErrorSchema.safeParse({ error: { code: "not_found", message: "No project" } }).success).toBe(true);
  });
});
