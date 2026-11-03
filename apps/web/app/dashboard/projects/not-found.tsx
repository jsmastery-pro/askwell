import { Button, EmptyState, GlassPanel } from "../../../components/ui";

// A project that doesn't exist or belongs to another owner (same page for both).
export default function ProjectNotFound() {
  return (
    <GlassPanel padding="none">
      <EmptyState
        title="Project not found"
        description="It may have been deleted, or the link is wrong."
        action={<Button href="/dashboard">Back to projects</Button>}
      />
    </GlassPanel>
  );
}
