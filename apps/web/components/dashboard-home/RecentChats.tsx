import Link from "next/link";
import { formatRelative } from "../conversations/format";
import { FOCUS } from "../ui/styles";

type Chat = { projectId: string; projectName: string; conversationId: string; preview: string; createdAt: string };

export function RecentChats({ chats, now }: { chats: Chat[]; now: Date }) {
  if (chats.length === 0) {
    return <p className="text-sm text-[#70788D]">No chats yet. They show up here after a visitor sends a message.</p>;
  }
  return (
    <ul className="divide-y divide-[#E3E7EE]">
      {chats.map((chat) => (
        <li key={`${chat.projectId}:${chat.conversationId}`}>
          <Link
            href={`/dashboard/projects/${chat.projectId}/conversations/${chat.conversationId}`}
            className={`block rounded-sm py-3 hover:bg-[#F5F7FA] ${FOCUS}`}
          >
            <p className="truncate text-sm text-[#161A24]">{chat.preview}</p>
            <p className="mt-1 truncate text-xs text-[#70788D]">
              {chat.projectName}, {formatRelative(chat.createdAt, now)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
