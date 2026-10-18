// @vitest-environment node
import { MAX_CHAT_MESSAGE_LENGTH, PLAN_LIMITS, RATE_LIMITS } from "@askwell/shared";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// docs/askwell-knowledge.md is what the landing page's own widget answers from: it must not
// drift from the real limits.
const doc = readFileSync(new URL("../../../../docs/askwell-knowledge.md", import.meta.url), "utf8");
const n = (value: number) => value.toLocaleString("en-US");
const row = (label: string) => doc.split("\n").find((line) => line.startsWith(`| ${label} |`));

describe("docs/askwell-knowledge.md", () => {
  it.each([
    ["Projects", "projects"],
    ["Messages per month, per project", "messagesPerMonth"],
    ["Knowledge files per project", "knowledgeFilesPerProject"],
  ] as const)("lists %s as in PLAN_LIMITS", (label, limit) => {
    expect(row(label)).toBe(`| ${label} | ${n(PLAN_LIMITS.free[limit])} | ${n(PLAN_LIMITS.pro[limit])} |`);
  });

  it("matches the message length and rate limits", () => {
    expect(doc).toContain(`up to ${n(MAX_CHAT_MESSAGE_LENGTH)} characters`);
    expect(doc).toContain(`up to ${RATE_LIMITS.widgetChat.max} messages a minute`);
  });
});
