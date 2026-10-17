import type { PostHogConfigResponse } from "../../../lib/posthog/config";
import { getPostHogConfig } from "../../../lib/posthog/server";

// Serves PostHog's public project key at runtime. A NEXT_PUBLIC_* value is fixed into the client
// bundle at build time, and InstaCloud builds have no env until the container starts.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(getPostHogConfig() satisfies PostHogConfigResponse, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
