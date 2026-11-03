import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import BillingPage from "./billing/page";
import DashboardError from "./error";
import DashboardLoading from "./loading";
import DashboardPage from "./page";

// The project list reads the session and the database on the server; here
// it's replaced by a fixed list so the page's own markup can be checked.
vi.mock("server-only", () => ({}));
const listOwnProjects = vi.fn();
const loadOwnPlan = vi.fn();
vi.mock("../../lib/projects/projects", () => ({ listOwnProjects: () => listOwnProjects() }));
vi.mock("../../lib/accounts/account", () => ({ loadOwnPlan: () => loadOwnPlan() }));

describe("/dashboard", () => {
  it("shows the title and, while the list loads, a skeleton", () => {
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).toContain("<h1");
    expect(html).toContain("Projects");
    expect(html).toContain('aria-label="Loading projects"');
  });

  it("the project list shows the empty state and an enabled Create project form", async () => {
    listOwnProjects.mockResolvedValue([]);
    loadOwnPlan.mockResolvedValue("free");
    const { ProjectsSection } = await import("../../components/projects/ProjectsSection");
    const html = renderToStaticMarkup(await ProjectsSection());
    expect(html).toContain("No projects yet");
    const button = html.match(/<button[^>]*>Create project<\/button>/)?.[0];
    expect(button).toBeDefined();
    expect(button).toMatch(/type="submit"/);
  });

  it("the project list shows the owner's projects", async () => {
    listOwnProjects.mockResolvedValue([
      {
        id: "p1",
        owner_id: "user_1",
        name: "Docs bot",
        public_key: "pk_abc",
        messages_used: 0,
        period_start: "2026-11-01T00:00:00+00:00",
        created_at: "2026-11-03T12:00:00Z",
      },
    ]);
    loadOwnPlan.mockResolvedValue("free");
    const { ProjectsSection } = await import("../../components/projects/ProjectsSection");
    const html = renderToStaticMarkup(await ProjectsSection());
    expect(html).toContain("Docs bot");
    expect(html).toContain('href="/dashboard/projects/p1"');
    expect(html).not.toContain("No projects yet");
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
