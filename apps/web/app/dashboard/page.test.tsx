import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BillingPage from "./billing/page";
import DashboardError from "./error";
import DashboardLoading from "./loading";
import DashboardPage from "./page";

describe("/dashboard", () => {
  const html = renderToStaticMarkup(<DashboardPage />);

  it("shows the empty state", () => {
    expect(html).toContain("<h1");
    expect(html).toContain("Projects");
    expect(html).toContain("No projects yet");
  });

  it("shows a disabled Create project button", () => {
    const button = html.match(/<button[^>]*>Create project<\/button>/)?.[0];
    expect(button).toBeDefined();
    expect(button).toMatch(/\sdisabled=""/);
  });
});

describe("/dashboard loading state", () => {
  it("shows skeletons with a loading status", () => {
    const html = renderToStaticMarkup(<DashboardLoading />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading"');
    expect(html).toContain("animate-pulse");
  });
});

describe("/dashboard error state", () => {
  it("shows an alert with a Try again button", () => {
    const html = renderToStaticMarkup(
      <DashboardError error={new Error("boom")} retry={() => undefined} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("This page didn&#x27;t load");
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
    // Never shows the raw error to the owner.
    expect(html).not.toContain("boom");
  });
});

describe("/dashboard/billing", () => {
  it("shows the placeholder", () => {
    const html = renderToStaticMarkup(<BillingPage />);
    expect(html).toContain("Billing");
    expect(html).toContain("Billing arrives soon");
  });
});
