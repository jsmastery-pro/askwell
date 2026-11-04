"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ConversationSummary, ListConversationsResponse } from "@askwell/shared";
import { Button, EmptyState, GlassPanel } from "../ui";
import { messageClasses } from "../projects/fields";
import { messageCountText, relativeTime } from "./format";
import { runAction, type ListAction, type ListDeps, type ListState } from "./list-state";

export interface ConversationsListProps {
  projectId: string;
  /** The first page, read on the server (owner client). */
  initialPage: ListConversationsResponse;
  /** The server's clock when it read the page (ISO): relative times start from it. */
  now: string;
  /** Start with this state instead (tests). */
  initialState?: Partial<ListState>;
  /** Replaces the route call (tests). */
  deps?: ListDeps;
}

/** One row: the first visitor message (one line, as text), the count and when it started. */
export function ConversationRow({
  projectId,
  conversation,
  now,
}: {
  projectId: string;
  conversation: ConversationSummary;
  now: string;
}) {
  const href = `/dashboard/projects/${projectId}/conversations/${conversation.id}`;
  return (
    <li>
      <Link
        href={href}
        className="flex min-w-0 flex-col gap-1 px-5 py-4 outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <p className={conversation.preview ? "truncate text-sm font-medium text-fg" : "text-sm italic text-fg-muted"}>
          {conversation.preview ?? "No visitor message yet"}
        </p>
        <p className="text-xs text-fg-muted">
          {messageCountText(conversation.message_count)} ·{" "}
          <time dateTime={conversation.created_at}>{relativeTime(conversation.created_at, now)}</time>
        </p>
      </Link>
    </li>
  );
}

/**
 * The project's conversations, newest first (§6.7). "Load older" appends the
 * next page while there is one; "Refresh" reloads from the top. No polling.
 */
export function ConversationsList({ projectId, initialPage, now, initialState, deps }: ConversationsListProps) {
  const [state, setState] = useState<ListState>({
    conversations: initialPage.conversations,
    nextCursor: initialPage.nextCursor,
    now,
    error: null,
    ...initialState,
  });
  const [running, setRunning] = useState<ListAction | null>(null);
  const [, startTransition] = useTransition();

  async function run(action: ListAction) {
    setRunning(action);
    const next = await runAction(projectId, state, action, deps);
    startTransition(() => {
      setState(next);
      setRunning(null);
    });
  }

  const { conversations, nextCursor, error } = state;
  const busy = running !== null;

  return (
    <section aria-labelledby="conversations-heading" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id="conversations-heading" className="text-lg font-semibold text-fg">
            Conversations
          </h2>
          <p className="text-sm text-fg-muted">What visitors asked your bot, newest first.</p>
        </div>
        <Button variant="secondary" size="sm" loading={running === "refresh"} disabled={busy} onClick={() => run("refresh")}>
          Refresh
        </Button>
      </div>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className={messageClasses}>{error.message}</p>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(error.action)}>
            Try again
          </Button>
        </div>
      ) : null}

      <GlassPanel padding="none">
        {conversations.length === 0 ? (
          <EmptyState
            title="No conversations yet"
            description="Chats from your widget show up here. Install the widget on your site, then refresh."
            action={
              <Button href={`/dashboard/projects/${projectId}/install`} variant="secondary" size="sm">
                Install the widget
              </Button>
            }
          />
        ) : (
          <ul aria-label="Conversations" className="flex flex-col divide-y divide-line">
            {conversations.map((c) => (
              <ConversationRow key={c.id} projectId={projectId} conversation={c} now={state.now} />
            ))}
          </ul>
        )}
      </GlassPanel>

      {nextCursor ? (
        <Button
          variant="secondary"
          className="self-center"
          loading={running === "older"}
          disabled={busy}
          onClick={() => run("older")}
        >
          Load older
        </Button>
      ) : null}
    </section>
  );
}
