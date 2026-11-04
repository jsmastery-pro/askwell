// The Conversations list's state and its two actions (project.md §6.7):
// "Load older" appends the next page; "Refresh" reloads from the top. No
// polling, no realtime (§12). Pure, with the fetcher passed in, so paging and
// refresh are tested without a DOM.
import type { ConversationSummary, ListConversationsResponse } from "@askwell/shared";
import type { ApiFailure, ApiResult } from "../projects/api";
import { listConversations } from "./api";

export type ListState = {
  conversations: ConversationSummary[];
  /** Null: no older page. */
  nextCursor: string | null;
  /** What relative times are measured from (ISO). */
  now: string;
  /** The last action failed: say so, and offer it again. */
  error: { action: ListAction; message: string } | null;
};

export type ListAction = "older" | "refresh";

export type ListDeps = {
  listConversations: typeof listConversations;
  /** The browser's clock, read when a page arrives. */
  now: () => string;
};

const defaultDeps: ListDeps = { listConversations, now: () => new Date().toISOString() };

/** A failed load, in words. Switches on the §8 code. */
export function loadErrorText(error: ApiFailure, action: ListAction): string {
  switch (error.code) {
    case "unauthorized":
      return "Your session ended. Sign in again.";
    case "not_found":
      return "This project no longer exists. Go back to your projects.";
    case "validation_failed":
      return "The list changed. Refresh to start from the top.";
    default:
      return action === "older" ? "Couldn't load older conversations. Try again." : "Couldn't refresh. Try again.";
  }
}

/** The state after a page arrives for `action`. */
export function applyPage(
  state: ListState,
  action: ListAction,
  result: ApiResult<ListConversationsResponse>,
  now: string,
): ListState {
  if (!result.ok) return { ...state, error: { action, message: loadErrorText(result.error, action) } };
  const { conversations, nextCursor } = result.data;
  if (action === "refresh") return { conversations, nextCursor, now, error: null };
  // Keyset pages don't overlap, but never show a row twice if one did.
  const seen = new Set(state.conversations.map((c) => c.id));
  return {
    conversations: [...state.conversations, ...conversations.filter((c) => !seen.has(c.id))],
    nextCursor,
    now: state.now,
    error: null,
  };
}

/** Runs `action` against the route and returns the next state. */
export async function runAction(
  projectId: string,
  state: ListState,
  action: ListAction,
  deps: ListDeps = defaultDeps,
): Promise<ListState> {
  if (action === "older" && !state.nextCursor) return state;
  const result = await deps.listConversations(projectId, action === "older" ? (state.nextCursor ?? undefined) : undefined);
  return applyPage(state, action, result, deps.now());
}
