// The project behind /dashboard/projects/[id], read once per request (the
// layout and the page both need it). Owner client via getOwnedProject, so
// another owner's project, or no project, is null → notFound().
import "server-only";
import { cache } from "react";
import { idParams, type Project } from "@askwell/shared";
import { getOwnedProject } from "../../../../lib/projects/projects";

export const loadProject = cache(async (id: string): Promise<Project | null> => {
  // Not a uuid: not a project, and not worth a database round trip.
  if (!idParams.safeParse({ id }).success) return null;
  return getOwnedProject(id);
});
