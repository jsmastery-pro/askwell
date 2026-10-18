import { PLAN_LIMITS } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { PRICING_ROWS } from "./Pricing";

const row = (feature: string) => PRICING_ROWS.find((r) => r.feature === feature);

describe("PRICING_ROWS", () => {
  it("reads every usage limit from PLAN_LIMITS", () => {
    expect(row("Projects")).toMatchObject({
      free: String(PLAN_LIMITS.free.projects),
      pro: String(PLAN_LIMITS.pro.projects),
    });
    expect(row("Messages / month (per project)")).toMatchObject({
      free: PLAN_LIMITS.free.messagesPerMonth.toLocaleString("en-US"),
      pro: PLAN_LIMITS.pro.messagesPerMonth.toLocaleString("en-US"),
    });
    expect(row("Knowledge sources (per project)")).toMatchObject({
      free: String(PLAN_LIMITS.free.knowledgeSourcesPerProject),
      pro: String(PLAN_LIMITS.pro.knowledgeSourcesPerProject),
    });
  });

  it("formats thousands with a separator", () => {
    expect(row("Messages / month (per project)")?.pro).toMatch(/^\d{1,3}(,\d{3})+$/);
  });
});
