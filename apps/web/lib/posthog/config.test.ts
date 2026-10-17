import { describe, expect, it } from "vitest";
import { isEmbedPath, recordsReplay } from "./config";

describe("recordsReplay", () => {
  it.each(["/", "/dashboard", "/dashboard/projects", "/dashboard/billing"])("records %s", (path) => {
    expect(recordsReplay(path)).toBe(true);
  });

  it.each(["/embed", "/sign-in", "/sign-up", "/dashboards", "/api/projects"])("never records %s", (path) => {
    expect(recordsReplay(path)).toBe(false);
  });
});

describe("isEmbedPath", () => {
  it.each(["/embed", "/embed/anything"])("matches %s", (path) => {
    expect(isEmbedPath(path)).toBe(true);
  });

  it.each(["/", "/dashboard", "/embedded", "/embeds"])("doesn't match %s", (path) => {
    expect(isEmbedPath(path)).toBe(false);
  });
});
