import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ProjectSectionError from "./error";

describe("project section error state", () => {
  it("shows Try again and never the error's details", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const html = renderToStaticMarkup(<ProjectSectionError error={new Error("secret detail")} retry={() => undefined} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("This page didn&#x27;t load");
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
    expect(html).not.toContain("secret detail");
  });
});
