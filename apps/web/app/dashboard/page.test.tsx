import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDashboard, type Dashboard } from "../../lib/data/analytics";
import DashboardPage from "./page";

vi.mock("@clerk/nextjs/server", () => ({ auth: { protect: vi.fn(async () => ({ userId: "user_owner" })) } }));
vi.mock("../../lib/data/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/data/analytics")>()),
  getDashboard: vi.fn(),
}));
vi.mock("server-only", () => ({}));

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const far = new Date(Date.now() + 20 * 86_400_000).toISOString();
const usage = (id: string, name: string, messagesUsed: number) => ({
  id,
  name,
  plan: "free" as const,
  messagesUsed,
  messagesLimit: 100,
  periodStart: new Date().toISOString(),
  resetsAt: far,
});

const base: Dashboard = {
  plan: "free",
  projectCount: 2,
  projectLimit: 3,
  usage: [usage(P1, "Help center", 12), usage(P2, "Docs", 64)],
  daily: [
    { day: "2026-10-12", messages: 40 },
    { day: "2026-10-13", messages: 60 },
  ],
  current: { messages: 100, conversations: 33, visitors: 26 },
  previous: { messages: 0, conversations: 30, visitors: 26 },
  recentChats: [
    { projectId: P2, projectName: "Docs", conversationId: "9a7e4c20-1d2b-4c3d-9e4f-5a6b7c8d9e01", preview: "Do you ship to Canada?", createdAt: new Date().toISOString() },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderPage(data: Dashboard, range?: string | string[]) {
  vi.mocked(getDashboard).mockResolvedValue(data);
  render(await DashboardPage({ searchParams: Promise.resolve({ range }) }));
}

describe("Dashboard home", () => {
  it("reads this owner's data for the chosen range, falling back to 30d", async () => {
    await renderPage(base, "7d");
    expect(getDashboard).toHaveBeenLastCalledWith("7d", expect.any(Date));
    cleanup();
    await renderPage(base, "abc");
    expect(getDashboard).toHaveBeenLastCalledWith("30d", expect.any(Date));
    expect(screen.getByRole("link", { name: "30d" }).getAttribute("aria-current")).toBe("true");
  });

  it("shows the cards with their change, the real project count and the chart, with no Demo badges", async () => {
    await renderPage(base, "30d");
    const totals = screen.getByRole("region", { name: "Totals, last 30 days" });
    expect(within(totals).getByText("New")).toBeTruthy(); // messages: previous period was 0
    expect(within(totals).getByText("+10%")).toBeTruthy(); // conversations: 33 vs 30
    expect(within(totals).getByText("2 of 3")).toBeTruthy();
    expect(screen.getByRole("img", { name: /100 messages, busiest day Oct 13: 60/ })).toBeTruthy();
    expect(screen.queryByText("Demo data")).toBeNull();
  });

  it("lists usage busiest first, and recent chats linking to their thread", async () => {
    await renderPage(base);
    const usageList = screen.getByRole("region", { name: "Projects: usage this month" });
    expect(within(usageList).getAllByRole("meter").map((m) => m.getAttribute("aria-label"))).toEqual([
      "Docs: messages used this month",
      "Help center: messages used this month",
    ]);
    expect(within(usageList).getByRole("link", { name: "Manage projects" }).getAttribute("href")).toBe("/dashboard/projects");

    const recent = screen.getByRole("region", { name: /Recent chats/ });
    expect(within(recent).getByRole("link", { name: /Do you ship to Canada\?/ }).getAttribute("href")).toBe(
      `/dashboard/projects/${P2}/conversations/9a7e4c20-1d2b-4c3d-9e4f-5a6b7c8d9e01`,
    );
  });

  it("welcomes a new account with the getting-started steps instead of cards and chart", async () => {
    await renderPage({ ...base, projectCount: 0, usage: [], recentChats: [], current: { messages: 0, conversations: 0, visitors: 0 } });
    expect(screen.getByRole("heading", { name: /Welcome to/ })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Create project" }).getAttribute("href")).toBe("/dashboard/projects");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("group", { name: "Time range" })).toBeNull();
  });

  it("with projects but no chats, shows 0 and points to the busiest project's Install tab", async () => {
    const none = { messages: 0, conversations: 0, visitors: 0 };
    await renderPage({ ...base, daily: base.daily.map((d) => ({ ...d, messages: 0 })), current: none, previous: none, recentChats: [] });
    expect(screen.getAllByText("None yet")).toHaveLength(3);
    expect(screen.getByText("No chats yet. Install the widget to start.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Install the widget on Docs" }).getAttribute("href")).toBe(`/dashboard/projects/${P2}/install`);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
