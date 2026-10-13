import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openBillingPortal, startCheckout } from "../../lib/data/billing-actions";
import { PlanActions } from "./PlanActions";

vi.mock("../../lib/data/billing-actions", () => ({
  startCheckout: vi.fn(async () => ({ url: "https://checkout.example/session" })),
  openBillingPortal: vi.fn(async () => ({ url: "https://portal.example/session" })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlanActions", () => {
  it("offers Upgrade on Free, and shows what it will do instead of navigating", async () => {
    const before = window.location.href;
    render(<PlanActions plan="free" />);
    expect(screen.getByText("Opens Stripe Checkout.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Manage subscription" })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    });

    expect(startCheckout).toHaveBeenCalledTimes(1);
    expect(openBillingPortal).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/opens Stripe Checkout/);
    expect(window.location.href).toBe(before);
  });

  it("offers Manage subscription on Pro", async () => {
    render(<PlanActions plan="pro" />);
    expect(screen.queryByRole("button", { name: "Upgrade to Pro" })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Manage subscription" }));
    });

    expect(openBillingPortal).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toMatch(/billing portal isn't connected yet/);
  });

  it("shows a pending label, and an error if the request fails", async () => {
    let fail: (e: Error) => void = () => {};
    vi.mocked(startCheckout).mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
    render(<PlanActions plan="free" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    });
    const button = screen.getByRole("button", { name: "Opening checkout…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    await act(async () => fail(new Error("network")));
    expect(screen.getByRole("alert").textContent).toMatch(/didn't open/);
    expect((screen.getByRole("button", { name: "Upgrade to Pro" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
