import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import posthog from "posthog-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardError from "./dashboard/error";
import EmbedError from "./embed/error";
import RootError from "./error";
import NotFound from "./not-found";

vi.mock("posthog-js", () => ({ default: { captureException: vi.fn() } }));

// PostHog's "ready" signal, resolved by each test when it wants PostHog to have started.
const ready = vi.hoisted(() => {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve: () => resolve() };
});
vi.mock("../lib/posthog/client", () => ({ posthogReady: ready.promise }));
const startPostHog = () => act(async () => ready.resolve());

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

  it("waits for PostHog to start, then sends the error (the boundary keeps it from autocapture)", async () => {
    const error = new Error("landing render failed");
    render(<RootError error={error} reset={() => {}} />);
    await act(async () => {});
    expect(posthog.captureException).not.toHaveBeenCalled();

    await startPostHog();
    // An earlier test's error was waiting on the same start, so it's sent now too.
    expect(posthog.captureException).toHaveBeenCalledWith(error);
  });
});

describe("DashboardError", () => {
  it("sends the error to PostHog too, right away once PostHog is running", async () => {
    await startPostHog();
    const error = new Error("dashboard render failed");
    render(<DashboardError error={error} reset={() => {}} />);
    await act(async () => {});
    expect(posthog.captureException).toHaveBeenCalledExactlyOnceWith(error);
  });
});

describe("EmbedError", () => {
  it("shows the panel's own unavailable message, not an app error page", () => {
    const { container } = render(<EmbedError />);
    expect(container.textContent).toBe("Chat is unavailable right now.");
  });

  it("sends nothing to PostHog (it never loads in the panel)", async () => {
    await startPostHog();
    render(<EmbedError />);
    await act(async () => {});
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
