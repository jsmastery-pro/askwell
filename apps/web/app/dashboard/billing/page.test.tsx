import { cleanup, render, screen, within } from "@testing-library/react";
import type { Plan } from "@askwell/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAccountPlan } from "../../../lib/data/billing";
import { listProjectUsage, type ProjectUsageRow } from "../../../lib/data/usage";
import BillingPage from "./page";

vi.mock("@clerk/nextjs/server", () => ({ auth: { protect: vi.fn(async () => ({ userId: "user_owner" })) } }));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ openUserProfile: vi.fn() }),
  PricingTable: () => <div data-testid="pricing-table" />,
}));
vi.mock("../../../lib/data/billing", () => ({ getAccountPlan: vi.fn() }));
vi.mock("../../../lib/data/usage", () => ({ listProjectUsage: vi.fn() }));

const far = new Date(Date.now() + 20 * 86_400_000).toISOString();
const usage = (name: string, plan: Plan, messagesUsed: number): ProjectUsageRow => ({
  id: `${name.length}1111111-1111-4111-8111-111111111111`,
  name,
  plan,
  messagesUsed,
  messagesLimit: plan === "free" ? 100 : 2000,
  periodStart: new Date().toISOString(),
  resetsAt: far,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderPage(plan: Plan, rows: ProjectUsageRow[]) {
  vi.mocked(getAccountPlan).mockResolvedValue(plan);
  vi.mocked(listProjectUsage).mockResolvedValue(rows);
  render(await BillingPage());
}

describe("Billing page", () => {
  it("shows Free with Upgrade, and each project's usage with its warning", async () => {
    await renderPage("free", [usage("Help center", "free", 85)]);

    const plan = screen.getByRole("region", { name: "Current plan" });
    expect(within(plan).getByText("Free")).toBeTruthy();
    expect(within(plan).getByTestId("pricing-table")).toBeTruthy();
    expect(within(plan).queryByRole("button", { name: "Manage subscription" })).toBeNull();

    const list = screen.getByRole("region", { name: "Messages this month" });
    expect(within(list).getByRole("link", { name: "Help center" }).getAttribute("href")).toBe(
      `/dashboard/projects/${usage("Help center", "free", 0).id}`,
    );
    expect(within(list).getByRole("meter", { name: "Help center: messages used this month" }).getAttribute("aria-valuenow")).toBe("85");
    expect(within(list).getByText("85% used.")).toBeTruthy();
    expect(listProjectUsage).toHaveBeenCalledWith("user_owner");
    expect(getAccountPlan).toHaveBeenCalledWith("user_owner");
  });

  it("shows Pro with Manage subscription, and the limit on every project", async () => {
    await renderPage("pro", [usage("Help center", "pro", 2000), usage("Docs", "pro", 10)]);

    const plan = screen.getByRole("region", { name: "Current plan" });
    expect(within(plan).getByText("Pro")).toBeTruthy();
    expect(within(plan).getByRole("button", { name: "Manage subscription" })).toBeTruthy();
    expect(within(plan).queryByTestId("pricing-table")).toBeNull();
    expect(screen.getAllByRole("meter")).toHaveLength(2);
    expect(screen.getByText("Limit reached.")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /Pro/ }).textContent).toContain("Your plan");
  });

  it("points to Projects when there are none", async () => {
    await renderPage("free", []);
    expect(screen.getByText("No projects yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create a project" }).getAttribute("href")).toBe("/dashboard/projects");
  });
});
