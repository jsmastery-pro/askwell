import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Reveal } from "./Reveal";

let trigger: (isIntersecting: boolean) => void = () => {};
const disconnect = vi.fn();

class FakeObserver {
  constructor(callback: IntersectionObserverCallback) {
    trigger = (isIntersecting) => callback([{ isIntersecting } as IntersectionObserverEntry], this as never);
  }
  observe() {}
  disconnect = disconnect;
}

function setup({ top, reduce = false, observer = true }: { top: number; reduce?: boolean; observer?: boolean }) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce") }));
  // jsdom has no IntersectionObserver of its own.
  if (observer) vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top } as DOMRect);
  render(<Reveal>Section</Reveal>);
  return screen.getByText("Section");
}

beforeEach(() => {
  vi.stubGlobal("innerHeight", 800);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Reveal", () => {
  it("hides content below the fold, then shows it once it scrolls into view", () => {
    const section = setup({ top: 1200 });
    expect(section.dataset.reveal).toBe("hidden");

    act(() => trigger(true));
    expect(section.dataset.reveal).toBe("shown");
    expect(disconnect).toHaveBeenCalled();
  });

  it("never hides content that's already on screen", () => {
    expect(setup({ top: 300 }).dataset.reveal).toBeUndefined();
  });

  it("does nothing with reduced motion", () => {
    expect(setup({ top: 1200, reduce: true }).dataset.reveal).toBeUndefined();
  });

  it("does nothing without IntersectionObserver", () => {
    expect(setup({ top: 1200, observer: false }).dataset.reveal).toBeUndefined();
  });
});
