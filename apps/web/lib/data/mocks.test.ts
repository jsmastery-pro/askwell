import { describe, expect, it } from "vitest";
import { MOCK_THREADS } from "../mock/conversations";

describe("mock reads match their shared schemas", () => {
  it("includes HTML-looking text so screens prove they render it as text", () => {
    const bodies = MOCK_THREADS.flatMap((t) => t.messages.map((m) => m.body));
    expect(bodies.some((body) => /<[a-z]/i.test(body))).toBe(true);
  });
});
