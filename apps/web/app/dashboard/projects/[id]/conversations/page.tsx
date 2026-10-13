import { getOwnedProject } from "@askwell/db/queries";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ConversationList } from "../../../../../components/conversations/ConversationList";
import { RefreshButton } from "../../../../../components/conversations/RefreshButton";
import { DemoBadge } from "../../../../../components/ui/DemoBadge";
import { listConversations } from "../../../../../lib/data/conversations";
import { SectionHeader } from "../../../../../components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function ConversationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth.protect();
  const { id } = await params;
  // Ownership first, before any data call (docs/ui-track.md).
  const project = await getOwnedProject(id, userId);
  if (!project) notFound();

  const conversations = await listConversations(project.id);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Conversations"
        badge={<DemoBadge />}
        description="What visitors asked your bot, newest first. Refresh to see new chats."
        actions={<RefreshButton />}
      />
      <ConversationList projectId={project.id} conversations={conversations} now={new Date()} />
    </div>
  );
}
