// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const after = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after }));

const { runAfterResponse } = await import("./background");

describe("runAfterResponse", () => {
  it("schedules the task with next/server's after()", () => {
    const task = vi.fn().mockResolvedValue(undefined);
    after.mockImplementation((fn: () => void) => fn());

    runAfterResponse(task);

    expect(after).toHaveBeenCalledWith(task);
    expect(task).toHaveBeenCalled();
  });

  it("falls back to running the task immediately if after() throws (no request scope)", () => {
    const task = vi.fn().mockResolvedValue(undefined);
    after.mockImplementation(() => {
      throw new Error("`after()` was called outside a request scope");
    });

    runAfterResponse(task);

    expect(task).toHaveBeenCalled();
  });
});
