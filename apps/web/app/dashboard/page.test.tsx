import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./page";

const protect = vi.fn();

vi.mock("@clerk/nextjs", () => ({ UserButton: () => <div data-clerk="user-button" /> }));
vi.mock("@clerk/nextjs/server", () => ({ auth: { protect: () => protect() } }));

async function render() {
  const { prelude } = await prerender(<DashboardPage />);
  return new Response(prelude).text();
}

beforeEach(() => protect.mockReset());

describe("/dashboard", () => {
  it("checks auth, then shows 'Signed in' and the user button", async () => {
    protect.mockResolvedValue({ userId: "user_1" });
    const html = await render();
    expect(protect).toHaveBeenCalledOnce();
    expect(html).toContain("Signed in");
    expect(html).toContain('data-clerk="user-button"');
  });
});
