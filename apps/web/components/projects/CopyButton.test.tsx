import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./CopyButton";

const capture = vi.hoisted(() => vi.fn());
vi.mock("posthog-js", () => ({ default: { capture } }));

const writeText = vi.fn();
Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function click() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button"));
  });
}

describe("CopyButton", () => {
  it("copies the snippet and sends snippet_copied", async () => {
    writeText.mockResolvedValue(undefined);
    render(<CopyButton text="<script src=widget.js></script>" />);

    await click();

    expect(writeText).toHaveBeenCalledWith("<script src=widget.js></script>");
    expect(capture).toHaveBeenCalledExactlyOnceWith("snippet_copied");
    expect(screen.getByRole("button").textContent).toBe("Copied");
  });

  it("doesn't send snippet_copied when the copy fails", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<CopyButton text="snippet" />);

    await click();

    expect(capture).not.toHaveBeenCalled();
    expect(screen.getByRole("button").textContent).toMatch(/Copy failed/);
  });
});
