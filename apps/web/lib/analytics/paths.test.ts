import { describe, expect, it } from "vitest";
import { isEmbedPath, isReplayPath } from "./paths";

describe("isEmbedPath", () => {
  it.each(["/embed", "/embed/", "/embed/x"])("is true for %s", (p) => expect(isEmbedPath(p)).toBe(true));
  it.each(["/", "/embedded", "/embed-preview", "/dashboard"])("is false for %s", (p) =>
    expect(isEmbedPath(p)).toBe(false),
  );
});

describe("isReplayPath", () => {
  it.each(["/", "/dashboard", "/dashboard/projects/1"])("records %s", (p) => expect(isReplayPath(p)).toBe(true));
  it.each(["/embed", "/sign-in", "/sign-up", "/dashboards", "/ui"])("doesn't record %s", (p) =>
    expect(isReplayPath(p)).toBe(false),
  );
});
