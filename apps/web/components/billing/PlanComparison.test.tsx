import { cleanup, render, screen, within } from "@testing-library/react";
import { PLAN_LIMITS } from "@askwell/shared";
import { afterEach, describe, expect, it } from "vitest";
import { PlanComparison } from "./PlanComparison";

afterEach(cleanup);

const row = (name: string) => screen.getByRole("rowheader", { name }).closest("tr")!;
const cells = (name: string) => within(row(name)).getAllByRole("cell").map((c) => c.textContent);

describe("PlanComparison", () => {
  it("uses the plan limits from packages/shared", () => {
    render(<PlanComparison plan="free" />);
    expect(cells("Projects")).toEqual([String(PLAN_LIMITS.free.projects), String(PLAN_LIMITS.pro.projects)]);
    expect(cells("Messages / month (per project)")).toEqual(["100", "2,000"]);
    expect(cells('"Powered by" badge')).toEqual(["Shown", "Hidden"]);
  });

  it("marks the current plan's column", () => {
    render(<PlanComparison plan="pro" />);
    const pro = screen.getByRole("columnheader", { name: /Pro/ });
    expect(pro.getAttribute("aria-current")).toBe("true");
    expect(pro.textContent).toContain("Your plan");
    expect(screen.getByRole("columnheader", { name: "Free" }).hasAttribute("aria-current")).toBe(false);
  });
});
