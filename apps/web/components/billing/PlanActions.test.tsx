import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanActions } from "./PlanActions";

const openUserProfile = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ openUserProfile }),
  PricingTable: (props: { for?: string }) => <div data-testid="pricing-table" data-for={props.for} />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlanActions", () => {
  it("shows Clerk's pricing table on Free", () => {
    render(<PlanActions plan="free" />);
    const table = screen.getByTestId("pricing-table");
    expect(table.dataset.for).toBe("user");
    expect(screen.queryByRole("button", { name: "Manage subscription" })).toBeNull();
  });

  it("opens Clerk's account management on Pro", () => {
    render(<PlanActions plan="pro" />);
    expect(screen.queryByTestId("pricing-table")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Manage subscription" }));

    expect(openUserProfile).toHaveBeenCalledTimes(1);
  });
});
