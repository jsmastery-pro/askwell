import { describe, expect, it, vi } from "vitest";
import DashboardPage from "../../app/dashboard/page";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

describe("/dashboard", () => {
  it("redirects to Projects, the dashboard's home", () => {
    expect(() => DashboardPage()).toThrow("NEXT_REDIRECT /dashboard/projects");
  });
});
