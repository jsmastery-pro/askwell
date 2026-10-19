import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import posthog from "posthog-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardError from "./dashboard/error";
import EmbedError from "./embed/error";
import RootError from "./error";
import NotFound from "./not-found";

vi.mock("posthog-js", () => ({ default: { captureException: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.mocked(posthog.captureException).mockClear();
});

describe("RootError", () => {
  it("says the page didn't load, retries, and links home", () => {
    const reset = vi.fn();
    render(<RootError error={new Error("boom")} reset={reset} />);

    expect(screen.getByRole("alert").textContent).toContain("This page didn't load");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Back to the home page" }).getAttribute("href")).toBe("/");
  });

  it("sends the error to PostHog, since the boundary keeps it from exception autocapture", () => {
    const error = new Error("landing render failed");
    render(<RootError error={error} reset={() => {}} />);
    expect(posthog.captureException).toHaveBeenCalledExactlyOnceWith(error);
  });
});

describe("DashboardError", () => {
  it("sends the error to PostHog too", () => {
    const error = new Error("dashboard render failed");
    render(<DashboardError error={error} reset={() => {}} />);
    expect(posthog.captureException).toHaveBeenCalledExactlyOnceWith(error);
  });
});

describe("EmbedError", () => {
  it("shows the panel's own unavailable message, not an app error page", () => {
    const { container } = render(<EmbedError />);
    expect(container.textContent).toBe("Chat is unavailable right now.");
  });

  it("sends nothing to PostHog (it never loads in the panel)", () => {
    render(<EmbedError />);
    expect(posthog.captureException).not.toHaveBeenCalled();
  });
});

describe("NotFound", () => {
  it("says the page doesn't exist and links home, in the landing's dark theme", () => {
    const { container } = render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This page doesn't exist.");
    expect(screen.getByRole("link", { name: "Back to Askwell" }).getAttribute("href")).toBe("/");
    expect(container.querySelector("main")!.className).toContain("theme-dark");
  });
});
