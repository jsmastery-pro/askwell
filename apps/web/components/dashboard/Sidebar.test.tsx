import { renderToStaticMarkup } from "react-dom/server";
import { APP_NAME } from "@askwell/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.fn(() => "/dashboard");
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => <div data-clerk="user-button" /> }));

const { Sidebar } = await import("./Sidebar");

const render = () => renderToStaticMarkup(<Sidebar plan={<span data-test="plan">Free</span>} />);

beforeEach(() => pathname.mockReturnValue("/dashboard"));

describe("Sidebar", () => {
  it("shows APP_NAME, the plan slot and the user button", () => {
    const html = render();
    expect(html).toContain(`>${APP_NAME}</a>`);
    expect(html).toContain('data-test="plan"');
    expect(html).toContain('data-clerk="user-button"');
  });

  it("links Projects and Billing", () => {
    const html = render();
    expect(html).toMatch(/<a[^>]*href="\/dashboard"[^>]*>Projects<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/dashboard\/billing"[^>]*>Billing<\/a>/);
  });

  it("marks the current page", () => {
    expect(render()).toMatch(/<a[^>]*aria-current="page"[^>]*>Projects<\/a>/);
    pathname.mockReturnValue("/dashboard/billing");
    const html = render();
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*>Billing<\/a>/);
    expect(html).not.toMatch(/<a[^>]*aria-current="page"[^>]*>Projects<\/a>/);
  });

  it("collapses the nav into a menu below md", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-label="Open menu"/);
    // Hidden on mobile until opened, always shown from md up.
    expect(html).toMatch(/<nav[^>]*class="[^"]*\bhidden\b[^"]*"/);
    expect(html).toMatch(/<nav[^>]*class="[^"]*\bmd:block\b[^"]*"/);
  });
});
