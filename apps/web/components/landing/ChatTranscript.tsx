type Message = { from: "bot" | "visitor"; text: string };

/** A neutral chat mock. Customers' widgets use their own brand colour; this one stays monochrome. */
export function ChatTranscript({ title, messages }: { title: string; messages: Message[] }) {
  return (
    <div className="ml-auto w-full max-w-sm rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-medium text-ink">{title}</span>
        <span className="h-2 w-2 rounded-full bg-ink" aria-hidden />
      </div>
      <div className="space-y-2 px-4 py-4">
        {messages.map((message, index) => (
          <p
            key={index}
            className={
              message.from === "bot"
                ? "max-w-[85%] rounded-2xl rounded-tl-md bg-surface-strong px-3 py-2 text-sm text-ink"
                : "ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-ink px-3 py-2 text-sm text-inverse"
            }
          >
            {message.text}
          </p>
        ))}
      </div>
    </div>
  );
}
