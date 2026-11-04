// The project behind /dashboard/projects/[id], read once per request (the
// layout and the page both need it). Owner client via getOwnedProject, so
// another owner's project, or no project, is null → notFound().
import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { idParams, type Project } from "@askwell/shared";
import { loadOwnPlan } from "../../../../lib/accounts/account";
import { getOwnedProject } from "../../../../lib/projects/projects";
import { projectUsage, type Usage } from "../../../../lib/usage/usage";

export const loadProject = cache(async (id: string): Promise<Project | null> => {
  // Not a uuid: not a project, and not worth a database round trip.
  if (!idParams.safeParse({ id }).success) return null;
  return getOwnedProject(id);
});

/**
 * The project's messages this month against the plan's limit, for the
 * project header. The plan is read on the server (owner client), never sent
 * by the client. Null when the project isn't the caller's. connection()
 * first: it reads the clock and the session, so never in a prerender.
 */
export async function loadProjectUsage(id: string): Promise<Usage | null> {
  await connection();
  const [project, plan] = await Promise.all([loadProject(id), loadOwnPlan()]);
  return project ? projectUsage(project, plan, new Date()) : null;
}
