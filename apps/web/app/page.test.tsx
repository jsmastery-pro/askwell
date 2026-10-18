import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

const request = vi.hoisted(() => ({ headers: new Headers({ host: "askwell.test", "x-forwarded-proto": "https" }) }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
// Stands in for next/script, which only injects the tag in a browser after hydration.
vi.mock("../components/landing/LandingWidget", () => ({
  LandingWidget: ({ publicKey }: { publicKey: string | null }) =>
    publicKey ? <div data-testid="landing-widget" data-key={publicKey} /> : null,
}));

const renderHome = async () => render(await Home());

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("LANDING_WIDGET_KEY", "");
});

const HEADINGS = [
  "A support agent that only says what your docs say.",
  "From your docs to an answer in three steps.",
  "See it answer a real question.",
  "Simple pricing. Upgrade when you outgrow Free.",
  "Install in one line.",
];

// Home now has client components (Reveal), so unmount before the environment goes away.
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("Home", () => {
  it("shows the app name", async () => {
    const { container } = await renderHome();
    expect(container.textContent).toContain("Askwell");
  });

  it("server-renders every section visible, so it reads without JavaScript", async () => {
    const html = renderToString(await Home());
    for (const heading of HEADINGS) expect(html).toContain(heading.replace(/'/g, "&#x27;"));
    expect(html).not.toContain("data-reveal");
  });

  it("uses the dark theme tokens", async () => {
    const { container } = await renderHome();
    expect(container.querySelector("main")!.className).toContain("theme-dark");
  });

  it("runs Askwell's own widget with LANDING_WIDGET_KEY, and points visitors to it", async () => {
    vi.stubEnv("LANDING_WIDGET_KEY", "pk_askwell_landing");
    const { getByTestId, container } = await renderHome();
    expect(getByTestId("landing-widget").dataset.key).toBe("pk_askwell_landing");
    expect(container.textContent).toContain("Try it: ask the chat in the corner about Askwell.");
  });

  it("renders without a widget, or the pointer to it, when the key isn't set", async () => {
    const { queryByTestId, container } = await renderHome();
    expect(queryByTestId("landing-widget")).toBeNull();
    expect(container.textContent).not.toContain("ask the chat in the corner");
    expect(container.textContent).toContain("See it answer a real question.");
  });

  it("shows the install snippet with this app's real URL", async () => {
    const { container } = await renderHome();
    expect(container.textContent).toContain('<script src="https://askwell.test/widget.js" data-key="pk_..."></script>');
    expect(container.textContent).not.toContain("askwell.app");
  });

  it("prefers NEXT_PUBLIC_APP_URL for the snippet", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/");
    const { container } = await renderHome();
    expect(container.textContent).toContain('<script src="https://app.example.com/widget.js"');
  });
});
