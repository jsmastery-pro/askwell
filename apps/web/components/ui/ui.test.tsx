import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardNotFound from "../../app/dashboard/not-found";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { PageHeader, SectionHeader } from "./PageHeader";
import { Bone, LoadingState } from "./Skeleton";

afterEach(cleanup);

describe("shared UI", () => {
  it("PageHeader is the page's h1; SectionHeader an h2 with its badge and actions", () => {
    render(
      <>
        <PageHeader title="Billing" description="Your plan." />
        <SectionHeader title="Knowledge" badge={<span>Demo data</span>} actions={<button type="button">Refresh</button>} />
      </>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Billing" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Knowledge" })).toBeTruthy();
    expect(screen.getByText("Demo data")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });

  it("EmptyState says what's missing and offers the next step", () => {
    render(<EmptyState title="No chats yet" action={<a href="/install">Install the widget</a>}>Add the widget.</EmptyState>);
    expect(screen.getByText("No chats yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Install the widget" })).toBeTruthy();
  });

  it("ErrorState is announced and retries", () => {
    const reset = vi.fn();
    render(<ErrorState title="Billing didn't load" reset={reset} />);
    expect(screen.getByRole("alert").textContent).toContain("Billing didn't load");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("LoadingState is a named status", () => {
    render(
      <LoadingState label="Loading billing">
        <Bone className="h-4" />
      </LoadingState>,
    );
    expect(screen.getByRole("status", { name: "Loading billing" })).toBeTruthy();
  });

  it("the dashboard 404 leads back to Projects", () => {
    render(<DashboardNotFound />);
    expect(screen.getByRole("link", { name: "Back to Projects" }).getAttribute("href")).toBe("/dashboard/projects");
  });
});
