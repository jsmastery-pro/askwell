import type { Metadata } from "next";
import { PageHeader } from "../../components/dashboard/PageHeader";
import { Button, EmptyState, GlassPanel } from "../../components/ui";

export const metadata: Metadata = { title: "Projects" };

// Phase 1: no projects yet. Phase 2 lists them and enables "Create project".
export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Projects" description="Each project is one chat bot for one website." />
      <GlassPanel padding="none">
        <EmptyState
          title="No projects yet"
          description="Create a project, add what your bot should know, then paste one script tag on your site."
          action={
            <Button disabled title="Coming soon">
              Create project
            </Button>
          }
        />
      </GlassPanel>
    </>
  );
}
