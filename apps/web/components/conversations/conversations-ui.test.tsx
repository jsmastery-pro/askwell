import type { ConversationSummary, Message } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { listConversations } from "./api";
import { ConversationsList } from "./ConversationsList";
import { ConversationsSkeleton, ThreadSkeleton } from "./ConversationsSkeleton";
import { ConversationThread } from "./ConversationThread";
import { formatDateTime, messageCountText, relativeTime } from "./format";
import { applyPage, loadErrorText, runAction, type ListDeps, type ListState } from "./list-state";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const P = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-11-04T20:10:00.000Z";
const XSS = "<b>hi</b><img src=x onerror=alert(1)>";

const summary = (n: number, overrides: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id: `c${n}`,
  project_id: P,
  visitor_id: `v${n}`,
  created_at: new Date(Date.parse(NOW) - n * 60_000).toISOString(),
  preview: `Question ${n}`,
  message_count: 2,
  ...overrides,
});
const page = (rows: ConversationSummary[], nextCursor: string | null = null) => ({ conversations: rows, nextCursor });
const state = (rows: ConversationSummary[], nextCursor: string | null = null): ListState => ({
  conversations: rows,
  nextCursor,
  now: NOW,
  error: null,
});
const list = (rows: ConversationSummary[], nextCursor: string | null = null, extra: Partial<ListState> = {}) =>
  renderToStaticMarkup(<ConversationsList projectId={P} initialPage={page(rows, nextCursor)} now={NOW} initialState={extra} />);

describe("ConversationsList", () => {
  it("lists conversations in the order given (newest first), each linking to its thread", () => {
    const html = list([summary(1, { message_count: 3 }), summary(90, { message_count: 1 })]);
    expect(html.indexOf("Question 1")).toBeLessThan(html.indexOf("Question 90"));
    expect(html).toContain(`href="/dashboard/projects/${P}/conversations/c1"`);
    expect(html).toContain("3 messages");
    expect(html).toContain("1 message ·");
    expect(html).toContain(">1 min ago<");
    expect(html).toContain(">1 h ago<");
    expect(html).toMatch(/<button[^>]*>Refresh<\/button>/);
  });

  it("shows the preview on one line (truncated), and a placeholder when there's no visitor message", () => {
    const html = list([summary(1, { preview: "A very long question ".repeat(20) }), summary(2, { preview: null, message_count: 0 })]);
    expect(html).toMatch(/<p class="truncate[^"]*">A very long question/);
    expect(html).toContain("No visitor message yet");
    expect(html).toContain("0 messages");
  });

  it("renders a preview as text, never HTML", () => {
    const html = list([summary(1, { preview: XSS })]);
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>hi");
  });

  it('shows "Load older" only while there is a next page', () => {
    expect(list([summary(1)], "cursor-1")).toMatch(/<button[^>]*>Load older<\/button>/);
    expect(list([summary(1)], null)).not.toContain("Load older");
  });

  it("the empty state links to Install, with no Load older", () => {
    const html = list([]);
    expect(html).toContain("No conversations yet");
    expect(html).toContain(`href="/dashboard/projects/${P}/install"`);
    expect(html).not.toContain('aria-label="Conversations"');
    expect(html).not.toContain("Load older");
  });

  it("a failed action shows its message with Try again, and keeps the rows", () => {
    const html = list([summary(1)], "cursor-1", {
      error: { action: "older", message: "Couldn't load older conversations. Try again." },
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Couldn&#x27;t load older conversations. Try again.");
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
    expect(html).toContain("Question 1");
  });
});

describe("paging and refresh (list-state)", () => {
  const deps = (result: Awaited<ReturnType<typeof listConversations>>) => {
    const fn = vi.fn<ListDeps["listConversations"]>(async () => result);
    return { listConversations: fn, now: () => "2026-11-04T21:00:00.000Z" };
  };

  it("Load older asks for the page before nextCursor and appends it", async () => {
    const d = deps({ ok: true, data: page([summary(3), summary(4)], "cursor-2") });
    const next = await runAction(P, state([summary(1), summary(2)], "cursor-1"), "older", d);
    expect(d.listConversations).toHaveBeenCalledWith(P, "cursor-1");
    expect(next.conversations.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(next.nextCursor).toBe("cursor-2");
    expect(next.now).toBe(NOW);
  });

  it("the last page clears nextCursor, so Load older disappears", async () => {
    const next = await runAction(P, state([summary(1)], "cursor-1"), "older", deps({ ok: true, data: page([summary(2)]) }));
    expect(next.nextCursor).toBeNull();
  });

  it("never shows a row twice, even if pages overlapped", () => {
    const next = applyPage(state([summary(1), summary(2)], "c"), "older", { ok: true, data: page([summary(2), summary(3)]) }, NOW);
    expect(next.conversations.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("Load older with no cursor does nothing", async () => {
    const d = deps({ ok: true, data: page([]) });
    const s = state([summary(1)], null);
    expect(await runAction(P, s, "older", d)).toBe(s);
    expect(d.listConversations).not.toHaveBeenCalled();
  });

  it("Refresh reloads from the top: replaces the rows and cursor, and restarts the clock", async () => {
    const fresh = summary(0, { id: "new", preview: "Just asked" });
    const d = deps({ ok: true, data: page([fresh, summary(1)], "cursor-a") });
    const next = await runAction(P, state([summary(1), summary(2), summary(3)], null), "refresh", d);
    expect(d.listConversations).toHaveBeenCalledWith(P, undefined);
    expect(next.conversations.map((c) => c.id)).toEqual(["new", "c1"]);
    expect(next.nextCursor).toBe("cursor-a");
    expect(next.now).toBe("2026-11-04T21:00:00.000Z");
  });

  it("a failure keeps the rows and records what to retry", async () => {
    const s = state([summary(1)], "cursor-1");
    const next = await runAction(P, s, "older", deps({ ok: false, error: { code: "internal", message: "x" } }));
    expect(next.conversations).toBe(s.conversations);
    expect(next.nextCursor).toBe("cursor-1");
    expect(next.error).toEqual({ action: "older", message: "Couldn't load older conversations. Try again." });

    const refreshed = await runAction(P, next, "refresh", deps({ ok: true, data: page([summary(1)]) }));
    expect(refreshed.error).toBeNull();
  });

  it("error words switch on the §8 code", () => {
    const err = (code: "unauthorized" | "not_found" | "validation_failed" | "internal") => ({ code, message: "m" });
    expect(loadErrorText(err("unauthorized"), "refresh")).toMatch(/Sign in again/);
    expect(loadErrorText(err("not_found"), "refresh")).toMatch(/no longer exists/);
    expect(loadErrorText(err("validation_failed"), "older")).toMatch(/Refresh to start from the top/);
    expect(loadErrorText(err("internal"), "refresh")).toBe("Couldn't refresh. Try again.");
  });
});

describe("ConversationThread", () => {
  const conversation = { id: "c1", project_id: P, visitor_id: "v1", created_at: "2026-11-04T20:06:58.291521+00:00" };
  const msg = (n: number, role: Message["role"], body: string): Message => ({
    id: `m${n}`,
    conversation_id: "c1",
    role,
    body,
    created_at: `2026-11-04T20:0${n}:00.000Z`,
  });

  it("shows every message in the order given (oldest first), visitor and bot told apart, with times", () => {
    const html = renderToStaticMarkup(
      <ConversationThread
        projectId={P}
        conversation={conversation}
        messages={[msg(6, "visitor", "Refund policy?"), msg(7, "bot", "5 business days.")]}
      />,
    );
    expect(html.indexOf("Refund policy?")).toBeLessThan(html.indexOf("5 business days."));
    expect(html).toMatch(/data-role="visitor" class="[^"]*items-end/);
    expect(html).toMatch(/data-role="bot" class="[^"]*items-start/);
    expect(html).toContain(">Visitor<");
    expect(html).toContain(">Bot<");
    expect(html).toContain('<time dateTime="2026-11-04T20:06:00.000Z">Nov 4, 2026, 8:06 PM UTC</time>');
    expect(html).toContain(`href="/dashboard/projects/${P}/conversations"`);
    expect(html).toContain("2 messages");
  });

  it("renders message bodies as text, never HTML, and keeps line breaks with CSS", () => {
    const html = renderToStaticMarkup(
      <ConversationThread projectId={P} conversation={conversation} messages={[msg(6, "visitor", `${XSS}\nline two`)]} />,
    );
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;&lt;img src=x onerror=alert(1)&gt;\nline two");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>hi");
    expect(html).toContain("whitespace-pre-wrap");
  });

  it("a conversation with no messages says so", () => {
    expect(renderToStaticMarkup(<ConversationThread projectId={P} conversation={conversation} messages={[]} />)).toContain(
      "No messages in this conversation yet.",
    );
  });
});

describe("skeletons", () => {
  it("are labelled loading statuses", () => {
    expect(renderToStaticMarkup(<ConversationsSkeleton />)).toContain('aria-label="Loading conversations"');
    expect(renderToStaticMarkup(<ThreadSkeleton />)).toContain('aria-label="Loading conversation"');
  });
});

describe("format", () => {
  it.each([
    ["2026-11-04T20:09:30.000Z", "just now"],
    ["2026-11-04T19:55:00.000Z", "15 min ago"],
    ["2026-11-04T17:10:00.000Z", "3 h ago"],
    ["2026-11-03T20:10:00.000Z", "1 day ago"],
    ["2026-10-30T20:10:00.000Z", "5 days ago"],
    ["2026-10-01T20:10:00.000Z", "Oct 1, 2026"],
    ["2026-11-04T20:11:00.000Z", "just now"],
  ])("relativeTime(%s) is %s", (iso, text) => {
    expect(relativeTime(iso, NOW)).toBe(text);
  });

  it("formats absolute times in UTC and counts messages", () => {
    expect(formatDateTime("2026-11-04T20:06:58.291521+00:00")).toBe("Nov 4, 2026, 8:06 PM UTC");
    expect(messageCountText(1)).toBe("1 message");
    expect(messageCountText(1234)).toBe("1,234 messages");
  });
});

describe("listConversations (API client)", () => {
  it("GETs the first page, then the page before an (encoded) cursor; refuses a bad body", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return Response.json(url.includes("bad") ? { conversations: [{ id: 1 }] } : page([summary(1)], "next"));
    });
    try {
      expect(await listConversations(P)).toEqual({ ok: true, data: page([summary(1)], "next") });
      await listConversations(P, "ab/cd");
      expect(calls).toEqual([`/api/projects/${P}/conversations`, `/api/projects/${P}/conversations?before=ab%2Fcd`]);
      expect((await listConversations("bad")).ok).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
