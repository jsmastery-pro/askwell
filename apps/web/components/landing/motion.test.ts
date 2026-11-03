import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENTER, REVEAL } from "./motion";

const css = readFileSync(new URL("./landing.css", import.meta.url), "utf8");
const reducedMotionBlock = "@media (prefers-reduced-motion: no-preference)";

describe("landing motion", () => {
  it("defines both classes", () => {
    expect(css).toContain(`.${ENTER} {`);
    expect(css).toContain(`.${REVEAL} {`);
  });

  it("only animates when the visitor allows motion", () => {
    const start = css.indexOf(reducedMotionBlock);
    expect(start).toBeGreaterThan(-1);
    // No animation is applied outside the no-preference block.
    expect(css.slice(0, start)).not.toMatch(/animation(-[a-z]+)?\s*:/);
    // The block ends at the first closing brace in column 0.
    const end = css.indexOf("\n}", start);
    expect(end).toBeGreaterThan(start);
    expect(css.slice(end + 2)).not.toMatch(/animation(-[a-z]+)?\s*:/);
    const noPreferenceBody = css.slice(start, end);
    expect(noPreferenceBody).toContain(`.${ENTER} {`);
    expect(noPreferenceBody).toContain(`.${REVEAL} {`);
  });
});
