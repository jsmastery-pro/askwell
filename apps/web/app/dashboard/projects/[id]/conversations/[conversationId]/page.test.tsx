import { cleanup, render, screen } from "@testing-library/react";
import { getOwnedProject, type ProjectRow } from "@askwell/db/queries";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_OTHER_PROJECT_ID, MOCK_OTHER_PROJECT_THREAD, MOCK_THREADS } from "../../../../../../lib/mock/conversations";
import ConversationPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: { protect: vi.fn(async () => ({ userId: "user_owner" })) } }));
vi.mock("@askwell/db/queries", () => ({ getOwnedProject: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

const PROJECT = "11111111-2222-4333-8444-555555555555";

const owned = (id: string): ProjectRow => ({
  id,
  ownerId: "user_owner",
  name: "Docs bot",
  publicKey: "pk_test",
  messagesUsed: 0,
  periodStart: new Date(),
  createdAt: new Date(),
});

afterEach(() => {
  cleanup();
  vi.mocked(getOwnedProject).mockReset();
});

const open = async (projectId: string, conversationId: string) =>
  render(await ConversationPage({ params: Promise.resolve({ id: projectId, conversationId }) }));

describe("ConversationPage", () => {
  it("shows this project's conversation", async () => {
    vi.mocked(getOwnedProject).mockResolvedValue(owned(PROJECT));
    const thread = MOCK_THREADS[0]!;

    await open(PROJECT, thread.id);

    expect(screen.getByRole("heading", { name: "Visitor 4f8c2e" })).toBeTruthy();
    expect(screen.getByText(thread.messages[0]!.body)).toBeTruthy();
    expect(screen.getByRole("link", { name: "← All conversations" }).getAttribute("href")).toBe(
      `/dashboard/projects/${PROJECT}/conversations`,
    );
  });

  it("404s for a conversation that belongs to another project", async () => {
    vi.mocked(getOwnedProject).mockResolvedValue(owned(PROJECT));
    await expect(open(PROJECT, MOCK_OTHER_PROJECT_THREAD.id)).rejects.toThrow("NEXT_NOT_FOUND");

    // Control: that project's own owner can open it.
    vi.mocked(getOwnedProject).mockResolvedValue(owned(MOCK_OTHER_PROJECT_ID));
    await open(MOCK_OTHER_PROJECT_ID, MOCK_OTHER_PROJECT_THREAD.id);
    expect(screen.getByText(MOCK_OTHER_PROJECT_THREAD.messages[0]!.body)).toBeTruthy();
  });

  it("404s for an unknown or malformed conversation ID", async () => {
    vi.mocked(getOwnedProject).mockResolvedValue(owned(PROJECT));
    await expect(open(PROJECT, "00000000-0000-4000-8000-000000000000")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(open(PROJECT, "abc")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s before loading anything when the project isn't owned", async () => {
    vi.mocked(getOwnedProject).mockResolvedValue(null);
    await expect(open(PROJECT, MOCK_THREADS[0]!.id)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
