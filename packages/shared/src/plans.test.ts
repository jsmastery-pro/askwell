import { describe, expect, it } from "vitest";
import { PLAN_LIMITS, PLAN_PRICES, PLANS } from "./index";

describe("PLAN_LIMITS matches project.md §5", () => {
  it("has a row for every plan", () => {
    expect(Object.keys(PLAN_LIMITS).sort()).toEqual([...PLANS].sort());
  });

  it("free: 1 project, 100 messages, 3 sources, nothing customizable", () => {
    expect(PLAN_LIMITS.free).toEqual({
      projects: 1,
      messagesPerMonth: 100,
      knowledgeSources: 3,
      customButtonColor: false,
      customPosition: false,
      customLabel: false,
      customAnimation: false,
      customHeaderText: false,
      hideBadge: false,
    });
  });

  it("pro: 5 projects, 2,000 messages, 25 sources, everything customizable", () => {
    expect(PLAN_LIMITS.pro).toEqual({
      projects: 5,
      messagesPerMonth: 2000,
      knowledgeSources: 25,
      customButtonColor: true,
      customPosition: true,
      customLabel: true,
      customAnimation: true,
      customHeaderText: true,
      hideBadge: true,
    });
  });
});

describe("PLAN_PRICES", () => {
  it("free is $0 and pro is $19/month", () => {
    expect(PLAN_PRICES.free).toEqual({ usdPerMonth: 0, display: "$0/month" });
    expect(PLAN_PRICES.pro).toEqual({ usdPerMonth: 19, display: "$19/month" });
  });
});
