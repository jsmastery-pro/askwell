import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: () => undefined }),
  useParams: () => ({ id: "11111111-1111-4111-8111-111111111111" }),
}));
const connection = vi.fn(async () => undefined);
vi.mock("next/server", () => ({ connection: () => connection() }));
const loadProject = vi.fn();
vi.mock("../project", () => ({ loadProject: (id: string) => loadProject(id) }));
vi.mock("../../project", () => ({ loadProject: (id: string) => loadProject(id) }));
const listOwnConversations = vi.fn();
const getOwnConversation = vi.fn();
vi.mock("../../../../../lib/conversations/conversations", () => ({
  listOwnConversations: (id: string) => listOwnConversations(id),
  getOwnConversation: (id: string) => getOwnConversation(id),
}));

const { ConversationsSection } = await import("./ConversationsSection");
const { ThreadSection } = await import("./[conversationId]/ThreadSection");
const { default: ConversationsPage } = await import("./page");
const { default: ConversationsError } = await import("./error");
const { default: ConversationNotFound } = await import("./[conversationId]/not-found");

const P = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const PROJECT = { id: P, owner_id: "user_1", name: "Docs bot", public_key: "pk_a", messages_used: 0, period_start: "2026-11-01T00:00:00+00:00", created_at: "2026-11-03T12:00:00Z" };
const CONVERSATION = { id: C, project_id: P, visitor_id: "v1", created_at: "2026-11-04T20:00:00.000Z" };

beforeEach(() => {
  connection.mockClear();
  loadProject.mockReset().mockResolvedValue(PROJECT);
  listOwnConversations.mockReset();
  getOwnConversation.mockReset();
});

describe("/dashboard/projects/[id]/conversations", () => {
  it("shows a loading skeleton while the list streams in", async () => {
    const html = renderToStaticMarkup(await ConversationsPage({ params: Promise.resolve({ id: P }) } as never));
    expect(html).toContain('aria-label="Loading conversations"');
  });

  it("reads the first page with the owner client after connection(), and lists it", async () => {
    listOwnConversations.mockResolvedValue({
      conversations: [{ ...CONVERSATION, preview: "Refund policy?", message_count: 2 }],
      nextCursor: "next",
    });
    const html = renderToStaticMarkup(await ConversationsSection({ projectId: P }));
    expect(connection).toHaveBeenCalledOnce();
    expect(listOwnConversations).toHaveBeenCalledWith(P);
    expect(html).toContain("Refund policy?");
    expect(html).toContain("Load older");
  });

  it("is the 404 page when the project isn't the caller's, and reads no conversations", async () => {
    loadProject.mockResolvedValue(null);
    await expect(ConversationsSection({ projectId: P })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listOwnConversations).not.toHaveBeenCalled();
  });

  it("the error state has Try again", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const html = renderToStaticMarkup(<ConversationsError error={new Error("boom")} retry={() => undefined} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Conversations didn&#x27;t load");
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
    expect(html).not.toContain("boom");
  });
});

describe("/dashboard/projects/[id]/conversations/[conversationId]", () => {
  it("shows the thread (owner client) with a link back", async () => {
    getOwnConversation.mockResolvedValue({
      conversation: CONVERSATION,
      messages: [{ id: "m1", conversation_id: C, role: "visitor", body: "Hi", created_at: "2026-11-04T20:00:01.000Z" }],
    });
    const html = renderToStaticMarkup(await ThreadSection({ projectId: P, conversationId: C }));
    expect(connection).toHaveBeenCalledOnce();
    expect(getOwnConversation).toHaveBeenCalledWith(C);
    expect(html).toContain(">Visitor<");
    expect(html).toContain(`href="/dashboard/projects/${P}/conversations"`);
  });

  it.each([
    ["the conversation isn't visible (another owner's, or unknown)", () => getOwnConversation.mockResolvedValue(null)],
    [
      "the conversation is in another of the caller's projects",
      () => getOwnConversation.mockResolvedValue({ conversation: { ...CONVERSATION, project_id: OTHER }, messages: [] }),
    ],
    ["the project isn't the caller's", () => loadProject.mockResolvedValue(null)],
  ])("is the 404 page when %s", async (_label, arrange) => {
    arrange();
    await expect(ThreadSection({ projectId: P, conversationId: C })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("its 404 page names the conversation and links back to the list", () => {
    const html = renderToStaticMarkup(<ConversationNotFound />);
    expect(html).toContain("Conversation not found");
    expect(html).toContain(`href="/dashboard/projects/${P}/conversations"`);
  });

  it("is the 404 page for a non-uuid id, without a database call", async () => {
    await expect(ThreadSection({ projectId: P, conversationId: "nope" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getOwnConversation).not.toHaveBeenCalled();
    expect(loadProject).not.toHaveBeenCalled();
  });
});
