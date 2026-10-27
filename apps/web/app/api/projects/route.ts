import {
  ERROR_CODES,
  createProjectRequestSchema,
  type CreateProjectResponse,
  type ListProjectsResponse,
} from "@askwell/shared";
import { createProject, listProjects, toProject } from "../../../lib/projects";
import { errorResponse, getOwnerId, invalidInput, readJson, unauthorized } from "../../../lib/projects/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const rows = await listProjects();
  return Response.json({ projects: rows.map(toProject) } satisfies ListProjectsResponse);
}

export async function POST(request: Request) {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const parsed = createProjectRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput("A project name of 1–60 characters is required.");

  const result = await createProject(ownerId, parsed.data.name);
  if (!result.ok) {
    return errorResponse(
      ERROR_CODES.planLimit,
      `Your plan allows ${result.limit} project${result.limit === 1 ? "" : "s"}. Upgrade to add more.`,
      403,
    );
  }
  return Response.json({ project: toProject(result.project) } satisfies CreateProjectResponse, { status: 201 });
}
