import { getOwnedProject } from "@askwell/db/queries";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ConversationList } from "../../../../../components/conversations/ConversationList";
import { RefreshButton } from "../../../../../components/conversations/RefreshButton";
import { FONT_DISPLAY } from "../../../../../components/landing/fonts";
import { DemoBadge } from "../../../../../components/project-shell/DemoBadge";
import { listConversations } from "../../../../../lib/data/conversations";

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-[#161A24]" style={FONT_DISPLAY}>
              Conversations
            </h2>
            <DemoBadge />
          </div>
          <p className="mt-2 max-w-xl text-sm text-[#70788D]">
            What visitors asked your bot, newest first. Refresh to see new chats.
          </p>
        </div>
        <RefreshButton />
      </div>
      <ConversationList projectId={project.id} conversations={conversations} now={new Date()} />
    </div>
  );
}
