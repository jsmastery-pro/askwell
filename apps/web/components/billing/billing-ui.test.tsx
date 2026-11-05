import { PLAN_PRICES } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Clerk's components are mocked: the pricing table records its props.
const pricingProps = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  PricingTable: (props: Record<string, unknown>) => {
    pricingProps(props);
    return <div data-testid="clerk-pricing-table" />;
  },
  useClerk: () => ({
    loaded: true,
    buildUserProfileUrl: () => "https://dev-slug.accounts.dev/user",
    buildUrlWithAuth: (to: string) => to,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, replace: () => undefined }) }));

const { accountPortalBillingUrl, BillingSkeleton, BillingView, manageSubscriptionUrl } = await import("./BillingView");
const { ACTIVATION_POLL_MS, ACTIVATION_TIMEOUT_MS, activationState, CHECKOUT_RETURN_URL, shouldPoll } = await import(
  "./activation"
);

const view = (plan: "free" | "pro", afterCheckout = false, initialElapsedMs = 0) =>
  renderToStaticMarkup(<BillingView plan={plan} afterCheckout={afterCheckout} initialElapsedMs={initialElapsedMs} />);

describe("BillingView", () => {
  it("Free: shows the current plan and Clerk's pricing table, returning here after checkout", () => {
    pricingProps.mockClear();
    const html = view("free");
    expect(html).toContain('data-plan="free"');
    expect(html).toContain("Free");
    expect(html).toContain(PLAN_PRICES.free.display);
    expect(html).toContain("1 project · 100 messages / month per project · 3 knowledge sources per project");
    expect(html).toContain('data-testid="clerk-pricing-table"');
    expect(pricingProps).toHaveBeenCalledWith(expect.objectContaining({ newSubscriptionRedirectUrl: "/dashboard/billing?checkout=success" }));
    expect(html).not.toContain("Manage subscription");
    expect(html).not.toContain("Activating Pro");
  });

  it("Pro: shows You're on Pro and Manage subscription, and no pricing table", () => {
    const html = view("pro");
    expect(html).toContain('data-plan="pro"');
    expect(html).toContain(PLAN_PRICES.pro.display);
    expect(html).toContain("5 projects · 2,000 messages / month per project · 25 knowledge sources per project");
    expect(html).toContain("You&#x27;re on Pro");
    expect(html).toMatch(/<button[^>]*>Manage subscription<\/button>/);
    expect(html).not.toContain("clerk-pricing-table");
  });

  it("back from checkout while the server still says Free: Activating Pro…", () => {
    const html = view("free", true);
    expect(html).toContain("Activating Pro…");
    expect(html).toContain('role="status"');
    // Just paid: no second Subscribe while the webhook catches up.
    expect(html).not.toContain("clerk-pricing-table");
  });

  it("after the timeout: the payment-received message", () => {
    const html = view("free", true, ACTIVATION_TIMEOUT_MS);
    expect(html).toContain("Payment received. Your plan will update shortly.");
    expect(html).toContain("Refresh in a minute.");
    expect(html).not.toContain("Activating Pro…");
    expect(html).not.toContain("clerk-pricing-table");
  });

  it("back from checkout and the webhook already made it Pro: the Pro view, no notice", () => {
    const html = view("pro", true);
    expect(html).toContain("You&#x27;re on Pro");
    expect(html).not.toContain("Activating Pro");
    expect(html).not.toContain("Payment received");
  });

  it("the Pro price shown matches Clerk's Pro plan ($19/month, monthly)", () => {
    expect(PLAN_PRICES.pro).toEqual({ usdPerMonth: 19, display: "$19/month" });
  });

  it("has a labelled loading skeleton", () => {
    expect(renderToStaticMarkup(<BillingSkeleton />)).toContain('aria-label="Loading billing"');
  });
});

describe("activation", () => {
  it("polls every 2 s for up to 30 s", () => {
    expect(ACTIVATION_POLL_MS).toBe(2000);
    expect(ACTIVATION_TIMEOUT_MS).toBe(30_000);
    expect(CHECKOUT_RETURN_URL).toBe("/dashboard/billing?checkout=success");
  });

  it.each([
    [false, "free", 0, "none"],
    [false, "pro", 0, "none"],
    [true, "free", 0, "activating"],
    [true, "free", 28_000, "activating"],
    [true, "free", 30_000, "timed-out"],
    [true, "pro", 4_000, "activated"],
    [true, "pro", 40_000, "activated"],
  ] as const)("afterCheckout=%s, plan=%s, %i ms → %s", (afterCheckout, plan, elapsed, state) => {
    expect(activationState(afterCheckout, plan, elapsed)).toBe(state);
  });

  it("only polls while activating", () => {
    expect(shouldPoll("activating")).toBe(true);
    for (const s of ["none", "timed-out", "activated"] as const) expect(shouldPoll(s)).toBe(false);
  });
});

describe("accountPortalBillingUrl", () => {
  it("is the account portal's billing section", () => {
    expect(accountPortalBillingUrl("https://dev-slug.accounts.dev/user")).toBe("https://dev-slug.accounts.dev/user/billing");
    expect(accountPortalBillingUrl("https://dev-slug.accounts.dev/user/")).toBe("https://dev-slug.accounts.dev/user/billing");
  });

  it("keeps a query (Clerk's dev session token) intact, after the new path", () => {
    expect(accountPortalBillingUrl("https://dev-slug.accounts.dev/user?__clerk_db_jwt=dvb_abc")).toBe(
      "https://dev-slug.accounts.dev/user/billing?__clerk_db_jwt=dvb_abc",
    );
  });
});

describe("manageSubscriptionUrl", () => {
  it("is the portal's billing section, decorated with the dev session by Clerk", () => {
    const clerk = {
      buildUserProfileUrl: () => "https://dev-slug.accounts.dev/user",
      buildUrlWithAuth: (to: string) => `${to}?__clerk_db_jwt=dvb_x`,
    };
    expect(manageSubscriptionUrl(clerk)).toBe("https://dev-slug.accounts.dev/user/billing?__clerk_db_jwt=dvb_x");
  });
});
