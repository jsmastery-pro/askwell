import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { currentUsage, usageLevel } from "./level";
import { UsageSummary } from "./UsageSummary";

const RESETS = "2026-11-13T00:00:00.000Z";
const NOW = "2026-10-20T12:00:00.000Z";

afterEach(cleanup);

const renderUsage = (used: number, extra: Partial<Parameters<typeof UsageSummary>[0]> = {}) =>
  render(<UsageSummary used={used} limit={100} resetsAt={RESETS} now={NOW} label="Help center: messages" {...extra} />);

const meter = () => screen.getByRole("meter", { name: "Help center: messages" });
const fill = () => meter().firstElementChild as HTMLElement;

describe("usageLevel", () => {
  it("warns from 80 % and flags the limit at 100 %", () => {
    expect(usageLevel(79, 100)).toBe("ok");
    expect(usageLevel(80, 100)).toBe("warning");
    expect(usageLevel(99, 100)).toBe("warning");
    expect(usageLevel(100, 100)).toBe("limit");
    expect(usageLevel(140, 100)).toBe("limit");
    expect(usageLevel(1600, 2000)).toBe("warning");
  });
});

describe("currentUsage", () => {
  it("keeps the count until the reset time, then shows 0", () => {
    expect(currentUsage(42, RESETS, NOW)).toEqual({ used: 42, periodEnded: false });
    expect(currentUsage(42, RESETS, RESETS)).toEqual({ used: 0, periodEnded: true });
  });
});

describe("UsageSummary", () => {
  it("shows the count, the bar and the reset date, with no warning below 80 %", () => {
    renderUsage(42);
    expect(screen.getByText("42")).toBeTruthy();
    expect(meter().getAttribute("aria-valuenow")).toBe("42");
    expect(fill().style.width).toBe("42%");
    expect(screen.getByText("Resets on November 13.")).toBeTruthy();
    expect(screen.queryByText(/% used\./)).toBeNull();
    expect(screen.queryByText("Limit reached.")).toBeNull();
  });

  it("warns at 80 %", () => {
    renderUsage(80);
    expect(screen.getByText("80% used.")).toBeTruthy();
    expect(screen.getByText(/the widget stops replying until November 13/)).toBeTruthy();
  });

  it("caps the bar at 100 % and says the limit is reached", () => {
    renderUsage(130);
    expect(meter().getAttribute("aria-valuenow")).toBe("100");
    expect(fill().style.width).toBe("100%");
    expect(screen.getByText("Limit reached.")).toBeTruthy();
    expect(screen.queryByText(/% used\./)).toBeNull();
  });

  it("links the warning to the upgrade only when given one", () => {
    renderUsage(100, { upgradeHref: "/dashboard/billing" });
    expect(screen.getByRole("link", { name: "Upgrade to Pro" }).getAttribute("href")).toBe("/dashboard/billing");
    cleanup();

    renderUsage(100);
    expect(screen.queryByRole("link", { name: "Upgrade to Pro" })).toBeNull();
  });

  it("shows a fresh month once the period has ended, before the count is reset", () => {
    renderUsage(100, { now: "2026-11-14T00:00:00.000Z" });
    expect(meter().getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByText("A new month starts with the next message.")).toBeTruthy();
    expect(screen.queryByText("Limit reached.")).toBeNull();
  });

  it("renders the compact title next to the count", () => {
    renderUsage(1234, { limit: 2000, title: <a href="/p">Help center</a> });
    expect(screen.getByRole("link", { name: "Help center" })).toBeTruthy();
    expect(screen.getByText("1,234")).toBeTruthy();
    expect(screen.getByText("/ 2,000")).toBeTruthy();
  });
});
