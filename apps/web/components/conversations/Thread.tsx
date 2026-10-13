import type { Message } from "@askwell/shared";
import { formatDateTime } from "../project-shell/format";

// The owner reads the chat from the bot's side: visitor on the left, bot on the right.
// Each message is labelled in text too, so the roles don't rely on color or position.
export function Thread({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-[#70788D]">This conversation has no messages.</p>;
  }

  return (
    <ol className="flex flex-col gap-4" aria-label="Messages">
      {messages.map((message) => {
        const bot = message.role === "bot";
        return (
          <li key={message.id} className={`flex max-w-[85%] flex-col sm:max-w-[70%] ${bot ? "self-end items-end" : "self-start items-start"}`}>
            <p className="mb-1 text-xs text-[#70788D]">
              <span className="font-medium text-[#3D4456]">{bot ? "Bot" : "Visitor"}</span>{" "}
              <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
            </p>
            <p
              className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm ${
                bot ? "rounded-br-md bg-[#161A24] text-white" : "rounded-bl-md border border-[#D7DCE6] bg-white text-[#161A24]"
              }`}
            >
              {message.body}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
