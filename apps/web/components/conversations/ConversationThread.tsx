// One conversation's messages, oldest first, visitor vs bot told apart by
// side and label (§6.7). Every body renders as text, never HTML (§9 "XSS"):
// React escapes it, and line breaks are kept with CSS.
import Link from "next/link";
import type { Conversation, Message } from "@askwell/shared";
import { GlassPanel } from "../ui";
import { cx } from "../ui/cx";
import { formatDateTime, messageCountText } from "./format";

const ROLE_LABELS: Record<Message["role"], string> = { visitor: "Visitor", bot: "Bot" };

export function ConversationThread({
  projectId,
  conversation,
  messages,
}: {
  projectId: string;
  conversation: Conversation;
  messages: Message[];
}) {
  return (
    <section aria-labelledby="thread-heading" className="flex min-w-0 flex-col gap-4">
      <Link
        href={`/dashboard/projects/${projectId}/conversations`}
        className="-my-2.5 inline-flex min-h-10 items-center self-start rounded-control text-sm text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-focus"
      >
        ← All conversations
      </Link>
      <div className="flex flex-col gap-1">
        <h2 id="thread-heading" className="text-lg font-semibold text-fg">
          Conversation
        </h2>
        <p className="text-sm text-fg-muted">
          Started <time dateTime={conversation.created_at}>{formatDateTime(conversation.created_at)}</time> ·{" "}
          {messageCountText(messages.length)}
        </p>
      </div>

      <GlassPanel>
        {messages.length === 0 ? (
          <p className="text-sm text-fg-muted">No messages in this conversation yet.</p>
        ) : (
          <ol aria-label="Messages" className="flex flex-col gap-4">
            {messages.map((m) => {
              const bot = m.role === "bot";
              return (
                <li
                  key={m.id}
                  data-role={m.role}
                  className={cx("flex min-w-0 flex-col gap-1", bot ? "items-start" : "items-end")}
                >
                  <p className="text-xs text-fg-muted">
                    <span className="font-medium text-fg">{ROLE_LABELS[m.role]}</span> ·{" "}
                    <time dateTime={m.created_at}>{formatDateTime(m.created_at)}</time>
                  </p>
                  <p
                    className={cx(
                      "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm",
                      bot ? "border border-line bg-glass text-fg" : "bg-primary text-primary-fg",
                    )}
                  >
                    {m.body}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </GlassPanel>
    </section>
  );
}
