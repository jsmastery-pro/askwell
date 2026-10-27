import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getOwnedProject } from "../../../../lib/projects";
import ProjectLayout from "./layout";

const pathname = vi.hoisted(() => ({ current: "" }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: { protect: vi.fn(async () => ({ userId: "user_owner" })) },
}));
vi.mock("../../../../lib/projects", () => ({ getOwnedProject: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => pathname.current,
}));

const PROJECT_ID = "11111111-2222-4333-8444-555555555555";
const base = `/dashboard/projects/${PROJECT_ID}`;

afterEach(() => {
  cleanup();
  vi.mocked(getOwnedProject).mockReset();
});

async function renderLayout() {
  render(await ProjectLayout({ children: <p>child</p>, params: Promise.resolve({ id: PROJECT_ID }) }));
}

describe("ProjectLayout", () => {
  it("renders the project name and all five tabs", async () => {
    vi.mocked(getOwnedProject).mockResolvedValue({
      id: PROJECT_ID,
      owner_id: "user_owner",
      name: "Docs bot",
      public_key: "pk_test",
      messages_used: 0,
      period_start: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    pathname.current = `${base}/knowledge`;

    await renderLayout();

    expect(screen.getByText("pk_test")).toBeTruthy();
    expect(getOwnedProject).toHaveBeenCalledWith(PROJECT_ID);
    expect(screen.getByRole("heading", { name: "Docs bot" })).toBeTruthy();
    const tabs = screen.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);
    expect(tabs).toEqual([
      ["Overview", base],
      ["Knowledge", `${base}/knowledge`],
      ["Conversations", `${base}/conversations`],
      ["Customize", `${base}/customize`],
      ["Install", `${base}/install`],
    ]);
    expect(screen.getByRole("link", { name: "Knowledge" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByText("child")).toBeTruthy();
  });

  it("404s for another owner's project", async () => {
    vi.mocked(getOwnedProject).mockResolvedValue(null);

    await expect(renderLayout()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
