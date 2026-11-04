import type { Metadata } from "next";
import { Suspense } from "react";
import { ConversationsSkeleton } from "../../../../../components/conversations/ConversationsSkeleton";
import { ConversationsSection } from "./ConversationsSection";

export const metadata: Metadata = { title: "Conversations" };

// A project's conversations (§6.7): newest first, "Load older", manual
// Refresh. The first page is read on the server inside <Suspense> (it reads
// the session); more pages come from the conversations route.
export default async function ConversationsPage({ params }: PageProps<"/dashboard/projects/[id]/conversations">) {
  const { id } = await params;
  return (
    <Suspense fallback={<ConversationsSkeleton />}>
      <ConversationsSection projectId={id} />
    </Suspense>
  );
}
