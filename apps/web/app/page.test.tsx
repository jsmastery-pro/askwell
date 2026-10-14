import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import Home from "./page";

const HEADINGS = [
  "A support agent that only says what your docs say.",
  "From your docs to an answer in three steps.",
  "See it answer a real question.",
  "Simple pricing. Upgrade when you outgrow Free.",
  "Install in one line.",
];

// Home now has client components (Reveal), so unmount before the environment goes away.
afterEach(cleanup);

describe("Home", () => {
  it("shows the app name", () => {
    const { container } = render(<Home />);
    expect(container.textContent).toContain("Askwell");
  });

  it("server-renders every section visible, so it reads without JavaScript", () => {
    const html = renderToString(<Home />);
    for (const heading of HEADINGS) expect(html).toContain(heading.replace(/'/g, "&#x27;"));
    expect(html).not.toContain("data-reveal");
  });

  it("uses the dark theme tokens", () => {
    const { container } = render(<Home />);
    expect(container.querySelector("main")!.className).toContain("theme-dark");
  });
});
