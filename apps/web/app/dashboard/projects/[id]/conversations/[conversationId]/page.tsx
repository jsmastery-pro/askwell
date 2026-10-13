import { getOwnedProject } from "@askwell/db/queries";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { visitorLabel } from "../../../../../../components/conversations/format";
import { RefreshButton } from "../../../../../../components/conversations/RefreshButton";
import { Thread } from "../../../../../../components/conversations/Thread";
import { FONT_DISPLAY } from "../../../../../../components/landing/fonts";
import { DemoBadge } from "../../../../../../components/project-shell/DemoBadge";
import { formatDateTime } from "../../../../../../components/project-shell/format";
import { FOCUS } from "../../../../../../components/projects/styles";
import { getConversation } from "../../../../../../lib/data/conversations";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string; conversationId: string }>;
}) {
  const { userId } = await auth.protect();
  const { id, conversationId } = await params;
  // Ownership first, then the conversation must belong to this project: an unknown ID,
  // a malformed ID and another project's conversation all look the same (§9).
  const project = await getOwnedProject(id, userId);
  if (!project) notFound();
  const conversation = await getConversation(project.id, conversationId);
  if (!conversation) notFound();

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/projects/${project.id}/conversations`}
        className={`text-sm text-[#70788D] hover:text-[#161A24] ${FOCUS}`}
      >
        ← All conversations
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-[#161A24]" style={FONT_DISPLAY}>
              {visitorLabel(conversation.visitorId)}
            </h2>
            <DemoBadge />
          </div>
          <p className="mt-1 text-sm text-[#70788D]">
            Started {formatDateTime(conversation.createdAt)}, {conversation.messages.length}{" "}
            {conversation.messages.length === 1 ? "message" : "messages"}
          </p>
        </div>
        <RefreshButton />
      </div>
      <div className="rounded-xl bg-[#E6EAF1] p-4 sm:p-6">
        <Thread messages={conversation.messages} />
      </div>
    </div>
  );
}
