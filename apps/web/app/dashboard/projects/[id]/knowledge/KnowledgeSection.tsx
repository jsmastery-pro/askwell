import { notFound } from "next/navigation";
import { PLAN_LIMITS } from "@askwell/shared";
import { KnowledgeManager } from "../../../../../components/knowledge/KnowledgeManager";
import { loadOwnPlan } from "../../../../../lib/accounts/account";
import { loadProject } from "../project";
import { listOwnSources } from "./sources";

/**
 * Reads the project (owner client), its sources (RLS) and the plan on the
 * server, then hands them to the client-side manager. Render inside
 * <Suspense>: it reads the request's session.
 */
export async function KnowledgeSection({ projectId }: { projectId: string }) {
  const project = await loadProject(projectId);
  if (!project) notFound();
  const [sources, plan] = await Promise.all([listOwnSources(project.id), loadOwnPlan()]);

  return (
    <KnowledgeManager
      projectId={project.id}
      initialSources={sources}
      plan={plan}
      limit={PLAN_LIMITS[plan].knowledgeSources}
    />
  );
}
