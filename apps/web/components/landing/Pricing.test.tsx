import { describe, expect, it } from "vitest";
import { PRICING_ROWS } from "./Pricing";

describe("PRICING_ROWS", () => {
  it("matches the plan limits from project.md section 5", () => {
    const byFeature = Object.fromEntries(PRICING_ROWS.map((row) => [row.feature, row]));

    expect(byFeature["Projects"]).toEqual({ feature: "Projects", free: "1", pro: "5" });
    expect(byFeature["Messages / month (per project)"]).toEqual({
      feature: "Messages / month (per project)",
      free: "100",
      pro: "2,000",
    });
    expect(byFeature["Knowledge files (per project)"]).toEqual({
      feature: "Knowledge files (per project)",
      free: "3",
      pro: "25",
    });
  });
});
