import { getOwnedProject } from "@askwell/db/queries";
import { PLAN_LIMITS } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { KnowledgeManager } from "../../../../../components/knowledge/KnowledgeManager";
import { FONT_DISPLAY } from "../../../../../components/landing/fonts";
import { DemoBadge } from "../../../../../components/project-shell/DemoBadge";
import { getAccountPlan } from "../../../../../lib/data/billing";
import { listKnowledgeSources } from "../../../../../lib/data/knowledge";

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
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-[#161A24]" style={FONT_DISPLAY}>
            Knowledge
          </h2>
          <DemoBadge />
        </div>
        <p className="mt-2 max-w-xl text-sm text-[#70788D]">
          The bot answers only from these sources. If something isn&apos;t here, it says it doesn&apos;t know.
        </p>
      </div>
      <KnowledgeManager
        projectId={project.id}
        initialSources={sources}
        filesLimit={PLAN_LIMITS[plan].knowledgeFilesPerProject}
        plan={plan}
      />
    </div>
  );
}
