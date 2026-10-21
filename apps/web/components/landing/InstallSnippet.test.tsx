import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InstallSnippet } from "./InstallSnippet";

afterEach(cleanup);

// A real deploy URL, about as long as InstaCloud's: the case that broke the section.
const LONG_URL = "https://prod-bob-web-63f3d4-00j7zh8xsmz.compute.instacloud-edge.com";

describe("InstallSnippet", () => {
  it("shows the exact one-line tag for the app's URL, wrapped visually so all of it is visible", () => {
    const { container } = render(<InstallSnippet appUrl={LONG_URL} />);
    const pre = container.querySelector("pre")!;

    expect(pre.textContent).toBe(`<script src="${LONG_URL}/widget.js" data-key="pk_..."></script>`);
    expect(pre.textContent).not.toContain("\n");
    expect(pre.className).toContain("whitespace-pre-wrap");
    expect(pre.className).toContain("break-all");
    // Nothing to scroll sideways, so no scroller to tab to.
    expect(pre.className).not.toContain("overflow-x-auto");
    expect(pre.hasAttribute("tabindex")).toBe(false);
  });

  it("lets both columns shrink, so the long URL can't widen the grid", () => {
    const { container } = render(<InstallSnippet appUrl={LONG_URL} />);
    const grid = container.querySelector("section > *")!;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]");
  });
});
