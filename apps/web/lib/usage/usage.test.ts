import { PLAN_LIMITS } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { addOneMonth, projectUsage } from "./usage";

const START = "2026-11-04T10:00:00.000Z";
const project = (messages_used: number, period_start = START) => ({ messages_used, period_start });
const at = (iso: string) => new Date(iso);

describe("addOneMonth (Postgres `+ interval '1 month'` in UTC)", () => {
  it.each([
    ["2026-11-04T10:00:00.000Z", "2026-12-04T10:00:00.000Z"],
    ["2026-12-15T23:59:59.999Z", "2027-01-15T23:59:59.999Z"],
    ["2027-01-31T08:00:00.000Z", "2027-02-28T08:00:00.000Z"],
    ["2028-01-31T08:00:00.000Z", "2028-02-29T08:00:00.000Z"],
    ["2026-03-31T00:00:00.000Z", "2026-04-30T00:00:00.000Z"],
    ["2026-11-04T10:00:00.123+00:00", "2026-12-04T10:00:00.123Z"],
  ])("%s → %s", (from, to) => {
    expect(addOneMonth(from).toISOString()).toBe(to);
  });
});

describe("projectUsage", () => {
  it("counts this period against the plan's limit", () => {
    expect(projectUsage(project(12), "free", at("2026-11-20T00:00:00Z"))).toEqual({
      used: 12,
      limit: PLAN_LIMITS.free.messagesPerMonth,
      resetsAt: "2026-12-04T10:00:00.000Z",
      atLimit: false,
    });
    expect(projectUsage(project(12), "pro", at("2026-11-20T00:00:00Z")).limit).toBe(PLAN_LIMITS.pro.messagesPerMonth);
  });

  it("rollover boundary: one ms before the period ends still counts; at the end it's a new month (0)", () => {
    expect(projectUsage(project(40), "free", at("2026-12-04T09:59:59.999Z"))).toMatchObject({
      used: 40,
      resetsAt: "2026-12-04T10:00:00.000Z",
    });
    // consume_message resets when period_start + 1 month <= now: equal counts as over.
    expect(projectUsage(project(40), "free", at("2026-12-04T10:00:00.000Z"))).toEqual({
      used: 0,
      limit: 100,
      resetsAt: null,
      atLimit: false,
    });
  });

  it("a period over a month old shows 0 used, even if it was at the limit", () => {
    expect(projectUsage(project(100), "free", at("2027-03-01T00:00:00Z"))).toMatchObject({ used: 0, atLimit: false });
  });

  it("at the limit", () => {
    expect(projectUsage(project(100), "free", at("2026-11-20T00:00:00Z"))).toMatchObject({ used: 100, atLimit: true });
    expect(projectUsage(project(99), "free", at("2026-11-20T00:00:00Z")).atLimit).toBe(false);
  });

  it("over the limit after a downgrade: shown as full, never more than the limit, never negative", () => {
    const usage = projectUsage(project(1500), "free", at("2026-11-20T00:00:00Z"));
    expect(usage).toMatchObject({ used: 100, limit: 100, atLimit: true });
    expect(usage.limit - usage.used).toBe(0);
    expect(projectUsage(project(-3), "free", at("2026-11-20T00:00:00Z")).used).toBe(0);
  });
});
