import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmbedError from "./embed/error";
import RootError from "./error";

afterEach(cleanup);

describe("RootError", () => {
  it("says the page didn't load, retries, and links home", () => {
    const reset = vi.fn();
    render(<RootError error={new Error("boom")} reset={reset} />);

    expect(screen.getByRole("alert").textContent).toContain("This page didn't load");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Back to the home page" }).getAttribute("href")).toBe("/");
  });
});

describe("EmbedError", () => {
  it("shows the panel's own unavailable message, not an app error page", () => {
    const { container } = render(<EmbedError />);
    expect(container.textContent).toBe("Chat is unavailable right now.");
  });
});
