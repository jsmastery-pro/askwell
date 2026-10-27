import { updateProjectRequestSchema, type DeleteProjectResponse, type UpdateProjectResponse } from "@askwell/shared";
import { deleteProject, renameProject, toProject } from "../../../../lib/projects";
import { getOwnerId, invalidInput, projectNotFound, readJson, unauthorized } from "../../../../lib/projects/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// Not found and not owned both return 404, so project existence stays private (§9): RLS hides
// another owner's project from the owner client, so neither touches a row.

export async function PATCH(request: Request, { params }: Context) {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const parsed = updateProjectRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput("A project name of 1–60 characters is required.");

  const { id } = await params;
  const project = await renameProject(id, parsed.data.name);
  if (!project) return projectNotFound();
  return Response.json({ project: toProject(project) } satisfies UpdateProjectResponse);
}

export async function DELETE(_request: Request, { params }: Context) {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const { id } = await params;
  if (!(await deleteProject(id))) return projectNotFound();
  return Response.json({ ok: true } satisfies DeleteProjectResponse);
}
