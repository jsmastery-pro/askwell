import { describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "./plans";

describe("PLAN_LIMITS", () => {
  it("matches project.md §5 for free", () => {
    expect(PLAN_LIMITS.free).toEqual({
      projects: 1,
      messagesPerMonth: 100,
      knowledgeFilesPerProject: 3,
      customizeWidget: false,
    });
  });

  it("matches project.md §5 for pro", () => {
    expect(PLAN_LIMITS.pro).toEqual({
      projects: 5,
      messagesPerMonth: 2000,
      knowledgeFilesPerProject: 25,
      customizeWidget: true,
    });
  });
});
