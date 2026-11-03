import { describe, expect, it } from "vitest";
import { routeAccess } from "./routes";

describe("routeAccess", () => {
  it.each([
    "/dashboard",
    "/dashboard/",
    "/dashboard/projects/abc",
    "/dashboard/settings?tab=billing",
  ])("protects owner page %s", (path) => {
    expect(routeAccess(path)).toBe("owner-page");
  });

  it.each([
    "/api/projects",
    "/api/projects/abc",
    "/api/projects/abc/knowledge",
    "/api/projects/abc/knowledge/upload-url",
    "/api/projects/abc/knowledge/finalize",
    "/api/projects/abc/conversations",
    "/api/projects/abc/config",
    "/api/knowledge/abc",
    "/api/conversations/abc",
  ])("protects owner API route %s", (path) => {
    expect(routeAccess(path)).toBe("owner-api");
  });

  it.each([
    "/",
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up",
    "/sign-up/verify-email-address",
    "/embed",
    "/embed/abc",
    "/api/widget/config",
    "/api/widget/chat",
    "/api/clerk/webhook",
    "/api/posthog-config",
    "/ui",
  ])("leaves %s public", (path) => {
    expect(routeAccess(path)).toBe("public");
  });
});
