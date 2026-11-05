import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const loadOwnPlan = vi.fn();
vi.mock("../../../lib/accounts/account", () => ({ loadOwnPlan: () => loadOwnPlan() }));
vi.mock("@clerk/nextjs", () => ({
  PricingTable: () => <div data-testid="clerk-pricing-table" />,
  useClerk: () => ({
    loaded: true,
    buildUserProfileUrl: () => "https://dev-slug.accounts.dev/user",
    buildUrlWithAuth: (to: string) => to,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, replace: () => undefined }) }));

const { default: BillingPage } = await import("./page");
const { BillingSection } = await import("./BillingSection");
const { default: BillingError } = await import("./error");

const params = (query: Record<string, string> = {}) => Promise.resolve(query);

beforeEach(() => loadOwnPlan.mockReset());

describe("/dashboard/billing", () => {
  it("shows the header and, while the plan loads, a skeleton", () => {
    const html = renderToStaticMarkup(<BillingPage searchParams={params()} params={Promise.resolve({})} />);
    expect(html).toContain("<h1");
    expect(html).toContain("Billing");
    expect(html).toContain('aria-label="Loading billing"');
  });

  it("a Free owner (plan read on the server) sees Free and Clerk's pricing table", async () => {
    loadOwnPlan.mockResolvedValue("free");
    const html = renderToStaticMarkup(await BillingSection({ searchParams: params() }));
    expect(loadOwnPlan).toHaveBeenCalledOnce();
    expect(html).toContain('data-plan="free"');
    expect(html).toContain('data-testid="clerk-pricing-table"');
    expect(html).not.toContain("Manage subscription");
  });

  it("a Pro owner sees Pro and Manage subscription", async () => {
    loadOwnPlan.mockResolvedValue("pro");
    const html = renderToStaticMarkup(await BillingSection({ searchParams: params() }));
    expect(html).toContain('data-plan="pro"');
    expect(html).toContain("Manage subscription");
    expect(html).not.toContain("clerk-pricing-table");
  });

  it("?checkout=success while still Free → Activating Pro…; any other value doesn't", async () => {
    loadOwnPlan.mockResolvedValue("free");
    expect(renderToStaticMarkup(await BillingSection({ searchParams: params({ checkout: "success" }) }))).toContain(
      "Activating Pro…",
    );
    expect(renderToStaticMarkup(await BillingSection({ searchParams: params({ checkout: "nope" }) }))).not.toContain(
      "Activating Pro",
    );
  });

  it("the error state has Try again and says nothing about the cause", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const html = renderToStaticMarkup(<BillingError error={new Error("db down")} retry={() => undefined} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Billing didn&#x27;t load");
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
    expect(html).not.toContain("db down");
  });
});
