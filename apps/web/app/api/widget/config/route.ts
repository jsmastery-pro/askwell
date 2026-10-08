import { ERROR_CODES, RATE_LIMITS, widgetConfigQuerySchema, type ApiError, type WidgetConfigResponse } from "@askwell/shared";
import { checkRateLimit, getClientIp } from "../../../../lib/rate-limit";
import { getWidgetConfigByKey } from "../../../../lib/widget-config";

export const dynamic = "force-dynamic";

// Public widget route: any origin, no credentials (§9 CORS).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: WidgetConfigResponse | ApiError, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store", ...headers },
  });
}

function error(code: string, message: string, status: number, headers?: Record<string, string>) {
  return json({ error: { code, message } }, status, headers);
}

export async function GET(request: Request) {
  const parsed = widgetConfigQuerySchema.safeParse({
    key: new URL(request.url).searchParams.get("key"),
  });
  if (!parsed.success) {
    return error(ERROR_CODES.invalidInput, "A valid key is required.", 400);
  }
  const { key } = parsed.data;

  // Before the lookup, so unknown keys can't be probed without limit.
  const limit = await checkRateLimit(
    `config:${key}:${getClientIp(request.headers)}`,
    RATE_LIMITS.widgetConfig,
  );
  if (!limit.allowed) {
    return error(ERROR_CODES.rateLimited, "Too many requests. Try again shortly.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const config = await getWidgetConfigByKey(key);
  if (!config) {
    return error(ERROR_CODES.notFound, "Widget not found.", 404);
  }
  return json({ config }, 200);
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
  });
}
