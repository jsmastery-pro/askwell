import { cleanup, render, screen } from "@testing-library/react";
import type { ConversationSummary, Message } from "@askwell/shared";
import { afterEach, describe, expect, it } from "vitest";
import { ConversationList } from "./ConversationList";
import { formatRelative, visitorLabel } from "./format";
import { Thread } from "./Thread";

const PROJECT = "11111111-2222-4333-8444-555555555555";
const NOW = new Date("2026-10-13T12:00:00.000Z");

afterEach(cleanup);

const message = (n: number, role: Message["role"], body: string): Message => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  role,
  body,
  createdAt: "2026-10-12T16:05:00.000Z",
});

describe("Thread", () => {
  it("renders HTML in message bodies as text", () => {
    const bodies = ["<script>alert(1)</script>", "<b>bold</b>", '<img src=x onerror="alert(1)">'];
    const { container } = render(
      <Thread messages={bodies.map((body, i) => message(i, i % 2 ? "bot" : "visitor", body))} />,
    );

    expect(container.querySelector("script, b, img")).toBeNull();
    for (const body of bodies) expect(screen.getByText(body)).toBeTruthy();
  });

  it("labels each message with its role in text, in order", () => {
    render(<Thread messages={[message(1, "visitor", "Hi"), message(2, "bot", "Hello")]} />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toMatch(/^Visitor.*Hi$/);
    expect(items[1]).toMatch(/^Bot.*Hello$/);
  });
});

describe("ConversationList", () => {
  const summary = (n: number, preview: string, createdAt: string): ConversationSummary => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    visitorId: `v_abc12${n}`,
    preview,
    messageCount: n,
    createdAt,
  });

  it("keeps the given newest-first order and renders previews as text", () => {
    const { container } = render(
      <ConversationList
        projectId={PROJECT}
        now={NOW}
        conversations={[
          summary(1, "<b>Newest</b>", "2026-10-13T11:00:00.000Z"),
          summary(2, "Older", "2026-10-10T11:00:00.000Z"),
        ]}
      />,
    );

    expect(container.querySelector("b")).toBeNull();
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.querySelector("span span")?.textContent)).toEqual(["<b>Newest</b>", "Older"]);
    expect(links[0]!.getAttribute("href")).toBe(`/dashboard/projects/${PROJECT}/conversations/${summary(1, "", "").id}`);
    expect(screen.getByText("1 hour ago")).toBeTruthy();
    expect(screen.getByText("Visitor abc121, 1 message")).toBeTruthy();
  });

  it("points an empty project to Install", () => {
    render(<ConversationList projectId={PROJECT} now={NOW} conversations={[]} />);
    expect(screen.getByText("No chats yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Install the widget" }).getAttribute("href")).toBe(
      `/dashboard/projects/${PROJECT}/install`,
    );
  });
});

describe("formatRelative", () => {
  it.each([
    ["2026-10-13T11:59:30.000Z", "just now"],
    ["2026-10-13T11:55:00.000Z", "5 minutes ago"],
    ["2026-10-13T09:00:00.000Z", "3 hours ago"],
    ["2026-10-12T10:00:00.000Z", "yesterday"],
    ["2026-09-29T12:00:00.000Z", "2 weeks ago"],
    ["2026-07-13T12:00:00.000Z", "3 months ago"],
  ])("%s → %s", (iso, expected) => {
    expect(formatRelative(iso, NOW)).toBe(expected);
  });
});

describe("visitorLabel", () => {
  it("shows the last 6 characters", () => {
    expect(visitorLabel("v_4f8c2e")).toBe("Visitor 4f8c2e");
    expect(visitorLabel("v_9d1e7f0a2b3c4d5e")).toBe("Visitor 3c4d5e");
  });
});
