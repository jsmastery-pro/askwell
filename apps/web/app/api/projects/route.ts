// GET /api/projects: the owner's projects, newest first.
// POST /api/projects: create a project, limited by the owner's plan.
// (project.md §6.3, §8 owner routes, §9 "Plan bypass", "Tenant leak")
import {
  API_ERROR_STATUS,
  createProjectBody,
  type CreateProjectResponse,
  type ListProjectsResponse,
} from "@askwell/shared";
import { ensureAccount, getOwnPlan } from "../../../lib/accounts/account";
import { jsonError } from "../../../lib/api/errors";
import { ownerRouteError, requireOwnerId } from "../../../lib/api/owner";
import { parseJsonBody } from "../../../lib/api/validation";
import { createProject, listOwnProjects, PlanLimitError } from "../../../lib/projects/projects";

export async function GET(): Promise<Response> {
  try {
    await requireOwnerId();
    const body: ListProjectsResponse = { projects: await listOwnProjects() };
    return Response.json(body);
  } catch (error) {
    return ownerRouteError("GET /api/projects", error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireOwnerId();

    const parsed = await parseJsonBody(createProjectBody, request);
    if (!parsed.success) return parsed.response;

    // The account row exists before the plan is read. The plan comes from the
    // database on the server, never from the client (§5, §9 "Plan bypass").
    const ownerId = await ensureAccount();
    const plan = await getOwnPlan();

    const body: CreateProjectResponse = { project: await createProject(ownerId, parsed.data.name, plan) };
    return Response.json(body, { status: 201 });
  } catch (error) {
    if (error instanceof PlanLimitError) {
      const upgrade = error.plan === "free" ? " Upgrade to Pro for more." : "";
      return jsonError(
        API_ERROR_STATUS.plan_limit_reached,
        "plan_limit_reached",
        `${error.message}${upgrade}`,
      );
    }
    return ownerRouteError("POST /api/projects", error);
  }
}
