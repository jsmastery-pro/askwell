// PATCH /api/projects/:id/config: save the owner's widget customization
// (project.md §6.8, §8 Owner). Every field is Pro-only (§5), so a Free owner
// gets 402 `payment_required` and nothing is written. The plan is read on the
// server for every request, never from the client (§9 "Plan bypass").
//
// Order: session → input → ownership (owner client, RLS; another owner's
// project is a 404, §9 "Tenant leak") → plan → write (service client).
import {
  API_ERROR_STATUS,
  idParams,
  updateWidgetConfigBody,
  type UpdateWidgetConfigResponse,
} from "@askwell/shared";
import { getOwnPlan } from "../../../../../lib/accounts/account";
import { jsonError } from "../../../../../lib/api/errors";
import { ownerRouteError, projectNotFound, requireOwnerId } from "../../../../../lib/api/owner";
import { parseInput, parseJsonBody } from "../../../../../lib/api/validation";
import { getOwnedProject } from "../../../../../lib/projects/projects";
import { updateWidgetConfig } from "../../../../../lib/widget/update-config";

export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]/config">): Promise<Response> {
  try {
    await requireOwnerId();

    const params = parseInput(idParams, await ctx.params);
    if (!params.success) return params.response;
    const body = await parseJsonBody(updateWidgetConfigBody, request);
    if (!body.success) return body.response;

    const project = await getOwnedProject(params.data.id);
    if (!project) return projectNotFound();

    // Only Pro may save (fail closed: any other plan is refused).
    if ((await getOwnPlan()) !== "pro") {
      return jsonError(
        API_ERROR_STATUS.payment_required,
        "payment_required",
        "Customizing the widget is a Pro feature. Upgrade to Pro to save these changes.",
      );
    }

    const config = await updateWidgetConfig(project.id, body.data);
    // The config row is created with the project (§6.3); missing means it was
    // deleted meanwhile, so the project is gone too.
    if (!config) return projectNotFound();

    const response: UpdateWidgetConfigResponse = { config };
    return Response.json(response);
  } catch (error) {
    return ownerRouteError("PATCH /api/projects/:id/config", error);
  }
}
