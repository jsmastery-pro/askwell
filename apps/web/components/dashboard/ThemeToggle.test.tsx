import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  const html = renderToStaticMarkup(<ThemeToggle />);

  it("is a labelled group", () => {
    expect(html).toMatch(/<fieldset[^>]*><legend[^>]*>Theme<\/legend>/);
  });

  it("renders all three options as radios", () => {
    const inputs = [...html.matchAll(/<input [^>]*>/g)].map((m) => m[0]);
    expect(inputs.every((i) => i.includes('type="radio"') && i.includes('name="theme"'))).toBe(true);
    const radios = inputs.map((i) => i.match(/value="([a-z]+)"/)?.[1]);
    expect(radios).toEqual(["light", "dark", "system"]);
    for (const label of ["Light", "Dark", "System"]) expect(html).toContain(`>${label}</span>`);
  });

  it("selects nothing on the server (the client reads the choice from <html>)", () => {
    expect(html).not.toMatch(/<input [^>]*\schecked=/);
  });
});
