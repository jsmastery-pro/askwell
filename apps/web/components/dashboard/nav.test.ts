import { describe, expect, it } from "vitest";
import { DASHBOARD_NAV, isNavItemActive } from "./nav";

const [projects, billing] = DASHBOARD_NAV;

describe("dashboard nav", () => {
  it("links Projects and Billing", () => {
    expect(DASHBOARD_NAV.map((i) => [i.label, i.href])).toEqual([
      ["Projects", "/dashboard"],
      ["Billing", "/dashboard/billing"],
    ]);
  });

  it("marks Projects active only on /dashboard", () => {
    expect(isNavItemActive(projects!, "/dashboard")).toBe(true);
    expect(isNavItemActive(projects!, "/dashboard/billing")).toBe(false);
  });

  it("marks Billing active on its page and below", () => {
    expect(isNavItemActive(billing!, "/dashboard/billing")).toBe(true);
    expect(isNavItemActive(billing!, "/dashboard/billing/invoices")).toBe(true);
    expect(isNavItemActive(billing!, "/dashboard")).toBe(false);
    expect(isNavItemActive(billing!, "/dashboard/billingx")).toBe(false);
  });
});
