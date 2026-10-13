import { getOwnedProject } from "@askwell/db/queries";
import { PLAN_LIMITS } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { KnowledgeManager } from "../../../../../components/knowledge/KnowledgeManager";
import { DemoBadge } from "../../../../../components/ui/DemoBadge";
import { getAccountPlan } from "../../../../../lib/data/billing";
import { listKnowledgeSources } from "../../../../../lib/data/knowledge";
import { SectionHeader } from "../../../../../components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function KnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth.protect();
  const { id } = await params;
  // The layout checks too; the page checks again because it loads project data itself.
  const project = await getOwnedProject(id, userId);
  if (!project) notFound();

  const [plan, sources] = await Promise.all([getAccountPlan(userId), listKnowledgeSources(project.id)]);

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Knowledge"
        badge={<DemoBadge />}
        description="The bot answers only from these sources. If something isn't here, it says it doesn't know."
      />
      <KnowledgeManager
        projectId={project.id}
        initialSources={sources}
        filesLimit={PLAN_LIMITS[plan].knowledgeFilesPerProject}
        plan={plan}
      />
    </div>
  );
}
