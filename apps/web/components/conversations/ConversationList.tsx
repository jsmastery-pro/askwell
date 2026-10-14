import type { ConversationSummary } from "@askwell/shared";
import Link from "next/link";
import { formatDateTime } from "../project-shell/format";
import { BUTTON_PRIMARY, FOCUS } from "../ui/styles";
import { formatRelative, visitorLabel } from "./format";
import { EmptyState } from "../ui/EmptyState";

type Props = { projectId: string; conversations: ConversationSummary[]; now: Date };

export function ConversationList({ projectId, conversations, now }: Props) {
  const base = `/dashboard/projects/${projectId}`;

  if (conversations.length === 0) {
    return (
      <EmptyState
        title="No chats yet"
        action={
          <Link href={`${base}/install`} className={BUTTON_PRIMARY}>
            Install the widget
          </Link>
        }
      >
        Add the widget to your site. Conversations show up here after a visitor sends a message.
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y divide-line border-y border-line">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <Link
            href={`${base}/conversations/${conversation.id}`}
            className={`flex flex-col gap-1 py-4 hover:bg-surface/60 sm:flex-row sm:items-baseline sm:gap-6 ${FOCUS}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">
                {conversation.preview || "No visitor message"}
              </span>
              <span className="mt-1 block text-xs text-muted">
                {visitorLabel(conversation.visitorId)}, {conversation.messageCount}{" "}
                {conversation.messageCount === 1 ? "message" : "messages"}
              </span>
            </span>
            <time
              dateTime={conversation.createdAt}
              title={formatDateTime(conversation.createdAt)}
              className="shrink-0 text-xs text-muted"
            >
              {formatRelative(conversation.createdAt, now)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
