import { getOwnedProject } from "@askwell/db/queries";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { visitorLabel } from "../../../../../../components/conversations/format";
import { RefreshButton } from "../../../../../../components/conversations/RefreshButton";
import { Thread } from "../../../../../../components/conversations/Thread";
import { DemoBadge } from "../../../../../../components/ui/DemoBadge";
import { formatDateTime } from "../../../../../../components/project-shell/format";
import { FOCUS } from "../../../../../../components/ui/styles";
import { getConversation } from "../../../../../../lib/data/conversations";
import { SectionHeader } from "../../../../../../components/ui/PageHeader";

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
        className={`text-sm text-muted hover:text-ink ${FOCUS}`}
      >
        ← All conversations
      </Link>
      <SectionHeader
        title={visitorLabel(conversation.visitorId)}
        badge={<DemoBadge />}
        description={`Started ${formatDateTime(conversation.createdAt)}, ${conversation.messages.length} ${
          conversation.messages.length === 1 ? "message" : "messages"
        }`}
        actions={<RefreshButton />}
      />
      <div className="rounded-xl bg-surface-strong p-4 sm:p-6">
        <Thread messages={conversation.messages} />
      </div>
    </div>
  );
}
