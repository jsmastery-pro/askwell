import { prerender } from "react-dom/static";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const protect = vi.fn();
const loadOwnPlan = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: { protect: () => protect() } }));
vi.mock("../../lib/accounts/account", () => ({ loadOwnPlan: () => loadOwnPlan() }));

const { PlanBadge } = await import("./PlanBadge");

async function render(node: ReactNode) {
  const { prelude } = await prerender(node);
  return new Response(prelude).text();
}

beforeEach(() => {
  protect.mockReset().mockResolvedValue({ userId: "user_1" });
  loadOwnPlan.mockReset();
});

describe("PlanBadge", () => {
  it("checks auth, then shows the plan", async () => {
    loadOwnPlan.mockResolvedValue("free");
    const html = await render(<PlanBadge />);
    expect(protect).toHaveBeenCalledOnce();
    expect(html).toContain('data-plan="free"');
    expect(html).toContain("Free");
  });

  it("shows Pro for a pro account", async () => {
    loadOwnPlan.mockResolvedValue("pro");
    expect(await render(<PlanBadge />)).toContain("Pro");
  });

  it("shows 'Plan unavailable' when the account can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    loadOwnPlan.mockRejectedValue(new Error("not visible"));
    const html = await render(<PlanBadge />);
    expect(html).toContain("Plan unavailable");
    expect(html).not.toContain("not visible");
  });

  it("doesn't load the plan when auth.protect() redirects", async () => {
    protect.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await render(<PlanBadge />).catch(() => undefined);
    expect(loadOwnPlan).not.toHaveBeenCalled();
  });
});
