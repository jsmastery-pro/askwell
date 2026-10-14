import Link from "next/link";
import { formatRelative } from "../conversations/format";
import { FOCUS } from "../ui/styles";

type Chat = { projectId: string; projectName: string; conversationId: string; preview: string; createdAt: string };

export function RecentChats({ chats, now }: { chats: Chat[]; now: Date }) {
  if (chats.length === 0) {
    return <p className="text-sm text-muted">No chats yet. They show up here after a visitor sends a message.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {chats.map((chat) => (
        <li key={`${chat.projectId}:${chat.conversationId}`}>
          <Link
            href={`/dashboard/projects/${chat.projectId}/conversations/${chat.conversationId}`}
            className={`block rounded-sm py-3 hover:bg-canvas ${FOCUS}`}
          >
            <p className="truncate text-sm text-ink">{chat.preview}</p>
            <p className="mt-1 truncate text-xs text-muted">
              {chat.projectName}, {formatRelative(chat.createdAt, now)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
