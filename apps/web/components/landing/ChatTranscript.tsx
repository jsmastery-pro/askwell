type Message = { from: "bot" | "visitor"; text: string };

export function ChatTranscript({ title, messages }: { title: string; messages: Message[] }) {
  return (
    <div className="ml-auto w-full max-w-sm rounded-lg border border-white/10 bg-[#161B28]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-sm font-medium text-white">{title}</span>
        <span className="h-2 w-2 rounded-full bg-[#F2A33C]" aria-hidden />
      </div>
      <div className="space-y-2 px-4 py-4">
        {messages.map((message, index) => (
          <p
            key={index}
            className={
              message.from === "bot"
                ? "max-w-[85%] rounded-lg rounded-tl-none bg-white/5 px-3 py-2 text-sm text-[#C3C9D6]"
                : "ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#F2A33C] px-3 py-2 text-sm text-[#161A24]"
            }
          >
            {message.text}
          </p>
        ))}
      </div>
    </div>
  );
}
