import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UsageMeter } from "./UsageMeter";

describe("UsageMeter", () => {
  it("shows used / limit, a bar, and the reset date", () => {
    const html = renderToStaticMarkup(
      <UsageMeter usage={{ used: 12, limit: 100, resetsAt: "2026-12-04T10:00:00.000Z", atLimit: false }} />,
    );
    expect(html).toContain("12 / 100");
    expect(html).toContain("messages this month");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="12"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain("width:12%");
    expect(html).toContain('Resets <time dateTime="2026-12-04T10:00:00.000Z">Dec 4, 2026</time>');
    expect(html).not.toContain("Limit reached");
  });

  it("formats the Pro limit with a thousands separator", () => {
    const html = renderToStaticMarkup(
      <UsageMeter usage={{ used: 1234, limit: 2000, resetsAt: "2026-12-04T10:00:00.000Z", atLimit: false }} />,
    );
    expect(html).toContain("1,234 / 2,000");
  });

  it("at the limit: a full bar and the limit-reached note (with an icon, not just color)", () => {
    const html = renderToStaticMarkup(
      <UsageMeter usage={{ used: 100, limit: 100, resetsAt: "2026-12-04T10:00:00.000Z", atLimit: true }} />,
    );
    expect(html).toContain("width:100%");
    expect(html).toContain("Limit reached: the widget is showing visitors the quota message.");
    expect(html).toContain("<svg");
    expect(html).toContain('data-usage="at-limit"');
  });

  it("after the month rolled over: 0 used, and no reset date yet", () => {
    const html = renderToStaticMarkup(<UsageMeter usage={{ used: 0, limit: 100, resetsAt: null, atLimit: false }} />);
    expect(html).toContain("0 / 100");
    expect(html).toContain("width:0%");
    expect(html).toContain("A new month starts with the next message");
    expect(html).not.toContain("Resets");
  });
});
