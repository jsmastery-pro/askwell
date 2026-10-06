import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("shows the app name", () => {
    const { container } = render(<Home />);
    expect(container.textContent).toContain("Askwell");
  });
});
