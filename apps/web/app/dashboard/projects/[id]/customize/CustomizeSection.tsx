import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CustomizeForm } from "../../../../../components/customize/CustomizeForm";
import { loadOwnPlan } from "../../../../../lib/accounts/account";
import { loadProject } from "../project";
import { loadWidgetConfig } from "./config";

/**
 * Reads the project (owner client), its stored widget config (RLS) and the
 * plan on the server, then hands them to the client-side form. Render inside
 * <Suspense>: it reads the session. connection() first, so no owner read
 * starts in a prerender only to be aborted (see loadOwnPlan).
 */
export async function CustomizeSection({ projectId }: { projectId: string }) {
  await connection();
  const project = await loadProject(projectId);
  if (!project) notFound();
  const [stored, plan] = await Promise.all([loadWidgetConfig(project.id), loadOwnPlan()]);
  return <CustomizeForm projectId={project.id} stored={stored} plan={plan} />;
}
