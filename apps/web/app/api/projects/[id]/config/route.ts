import {
  applyPlanToConfig,
  ERROR_CODES,
  updateWidgetConfigRequestSchema,
  type UpdateWidgetConfigResponse,
} from "@askwell/shared";
import { getAccountPlan } from "../../../../../lib/data/billing";
import { writeWidgetConfig } from "../../../../../lib/data/config";
import { getOwnedProject } from "../../../../../lib/projects";
import { errorResponse, getOwnerId, invalidInput, projectNotFound, readJson, unauthorized } from "../../../../../lib/projects/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// Not found and not owned both return 404, so project existence stays private (§9).

export async function PATCH(request: Request, { params }: Context) {
  const ownerId = await getOwnerId();
  if (!ownerId) return unauthorized();

  const { id: projectId } = await params;
  if (!(await getOwnedProject(projectId))) return projectNotFound();

  // The plan is read on the server, never trusted from the client (§9 Plan bypass).
  const plan = await getAccountPlan();
  if (plan !== "pro") {
    return errorResponse(ERROR_CODES.paymentRequired, "Upgrade to Pro to customize the widget.", 402);
  }

  const parsed = updateWidgetConfigRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput("Invalid widget config.");

  const stored = await writeWidgetConfig(projectId, parsed.data);
  return Response.json({ config: applyPlanToConfig(stored, plan) } satisfies UpdateWidgetConfigResponse);
}
