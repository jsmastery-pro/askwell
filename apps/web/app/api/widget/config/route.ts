// GET /api/widget/config?key=pk_... (project.md §8, public).
//
// The widget loader calls this from customers' sites to style its button, so
// any origin may call it (§9 "CORS"). The key only identifies a project and
// grants nothing (§9 "Public key abuse"). The response is the plan-applied
// config, exactly the 6 WidgetSettings fields: no owner, plan or IDs.
//
// TODO(Phase 3): rate limit this public route with Arcjet (per route + public
// key + IP), as §3 Security and §9 "Cost abuse" require.
import {
  API_ERROR_STATUS,
  widgetConfigQuery,
  type WidgetConfigResponse,
  type WidgetSettings,
} from "@askwell/shared";
import type { NextRequest } from "next/server";
import { publicPreflight, withPublicCors, type PublicMethod } from "../../../../lib/api/cors";
import { jsonError } from "../../../../lib/api/errors";
import { parseQuery } from "../../../../lib/api/validation";
import { getPublicWidgetConfig } from "../../../../lib/widget/config";

const METHODS: readonly PublicMethod[] = ["GET"];

/** Every response: never cached for now (a config change must show on the next reload, Phase 5), plus CORS. */
function respond(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return withPublicCors(response, METHODS);
}

export async function GET(request: NextRequest): Promise<Response> {
  const parsed = parseQuery(widgetConfigQuery, request.nextUrl.searchParams);
  if (!parsed.success) return respond(parsed.response);

  let config: WidgetSettings | null;
  try {
    config = await getPublicWidgetConfig(parsed.data.key);
  } catch (error) {
    console.error("GET /api/widget/config failed", error);
    return respond(jsonError(API_ERROR_STATUS.internal, "internal", "Something went wrong. Try again."));
  }

  // The same 404 for every unknown key, so the route can't be used to learn
  // anything beyond "this key works".
  if (!config) {
    return respond(jsonError(API_ERROR_STATUS.not_found, "not_found", "No widget uses this key."));
  }

  const body: WidgetConfigResponse = { config };
  return respond(Response.json(body));
}

export function OPTIONS(): Response {
  return publicPreflight(METHODS);
}
