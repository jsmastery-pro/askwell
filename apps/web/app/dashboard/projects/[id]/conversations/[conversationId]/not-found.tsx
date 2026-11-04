"use client";

import { useParams } from "next/navigation";
import { Button, EmptyState, GlassPanel } from "../../../../../../components/ui";

// A conversation that doesn't exist, isn't the caller's, or is in another
// project (the same page for all three). The project header and tabs stay.
export default function ConversationNotFound() {
  const { id } = useParams<{ id: string }>();
  return (
    <GlassPanel padding="none">
      <EmptyState
        title="Conversation not found"
        description="It may have been deleted, or the link is wrong."
        action={<Button href={`/dashboard/projects/${encodeURIComponent(id)}/conversations`}>Back to conversations</Button>}
      />
    </GlassPanel>
  );
}
