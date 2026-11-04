import type { Metadata } from "next";
import { Suspense } from "react";
import { ThreadSkeleton } from "../../../../../../components/conversations/ConversationsSkeleton";
import { ThreadSection } from "./ThreadSection";

export const metadata: Metadata = { title: "Conversation" };

// One conversation's full thread (§6.7). Not in this project, or not the
// caller's → the 404 page.
export default async function ConversationPage({
  params,
}: PageProps<"/dashboard/projects/[id]/conversations/[conversationId]">) {
  const { id, conversationId } = await params;
  return (
    <Suspense fallback={<ThreadSkeleton />}>
      <ThreadSection projectId={id} conversationId={conversationId} />
    </Suspense>
  );
}
