import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, buttonClasses } from "./Button";

describe("Button", () => {
  it("renders a primary button by default", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);
    expect(html).toMatch(/^<button /);
    expect(html).toContain('type="button"');
    expect(html).toContain("bg-primary");
    expect(html).toContain("Save");
  });

  it("renders secondary and ghost variants", () => {
    expect(renderToStaticMarkup(<Button variant="secondary">A</Button>)).toContain(
      "border-line-strong",
    );
    expect(renderToStaticMarkup(<Button variant="ghost">B</Button>)).toContain("hover:bg-hover");
  });

  it("disables and shows a spinner while loading", () => {
    const html = renderToStaticMarkup(<Button loading>Save</Button>);
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
  });

  it("renders as a link when href is set", () => {
    const html = renderToStaticMarkup(
      <Button href="/dashboard" variant="secondary">
        Open
      </Button>,
    );
    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain("<button");
  });
});

describe("Button tap targets", () => {
  it("sm is 40px tall on phones and compact from sm up", () => {
    const classes = buttonClasses({ size: "sm" }).split(" ");
    expect(classes).toContain("h-10");
    expect(classes).toContain("sm:h-8");
  });

  it("md and lg are at least 40px everywhere", () => {
    expect(buttonClasses({ size: "md" }).split(" ")).toContain("h-10");
    expect(buttonClasses({ size: "lg" }).split(" ")).toContain("h-12");
  });
});
