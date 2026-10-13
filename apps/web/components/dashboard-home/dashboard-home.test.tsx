import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { describeChange } from "./change";
import { chartSummary, MessagesChart } from "./MessagesChart";
import { RangeSwitch } from "./RangeSwitch";

afterEach(cleanup);

describe("describeChange", () => {
  it("shows the percentage change against the previous period", () => {
    expect(describeChange(118, 100)).toEqual({ label: "+18%", direction: "up" });
    expect(describeChange(95, 100)).toEqual({ label: "−5%", direction: "down" });
    expect(describeChange(100, 100)).toEqual({ label: "0%", direction: "flat" });
    expect(describeChange(0, 40)).toEqual({ label: "−100%", direction: "down" });
  });

  it('says "New" when the previous period was 0, and nothing when both are', () => {
    expect(describeChange(12, 0)).toEqual({ label: "New", direction: "new" });
    expect(describeChange(0, 0)).toBeNull();
  });
});

describe("MessagesChart", () => {
  const days = [
    { day: "2026-10-07", messages: 40 },
    { day: "2026-10-08", messages: 96 },
    { day: "2026-10-09", messages: 1148 },
  ];

  it("summarises the total and the busiest day as its text alternative", () => {
    expect(chartSummary(days)).toBe("1,284 messages, busiest day Oct 9: 1,148");
    render(<MessagesChart days={days} />);
    expect(screen.getByRole("img", { name: "Messages per day: 1,284 messages, busiest day Oct 9: 1,148" })).toBeTruthy();
    expect(screen.getByText("1,284 messages, busiest day Oct 9: 1,148.")).toBeTruthy();
  });

  it("draws one bar per day", () => {
    const { container } = render(<MessagesChart days={days} />);
    expect(container.querySelectorAll("rect")).toHaveLength(3);
  });
});

describe("RangeSwitch", () => {
  it("is a group of links that keep the range in the URL, with the current one marked", () => {
    render(<RangeSwitch current="7d" />);
    const group = screen.getByRole("group", { name: "Time range" });
    const links = Array.from(group.querySelectorAll("a"));
    expect(links.map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("aria-current")])).toEqual([
      ["7d", "?range=7d", "true"],
      ["30d", "?range=30d", null],
      ["90d", "?range=90d", null],
    ]);
  });
});
