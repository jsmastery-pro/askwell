// GET /api/posthog-config (project.md §8, System).
//
// PostHog's public project key and host. Both are public by design (§11), but
// they're per-environment config, so they're read at request time, not baked
// into the build.
import { API_ERROR_STATUS, type PosthogConfigResponse } from "@askwell/shared";
import { connection } from "next/server";
import { jsonError } from "../../../lib/api/errors";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  await connection();

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) {
    console.error("GET /api/posthog-config: NEXT_PUBLIC_POSTHOG_KEY or NEXT_PUBLIC_POSTHOG_HOST is not set");
    return jsonError(API_ERROR_STATUS.internal, "internal", "Analytics isn't configured.", { headers: NO_STORE });
  }

  const body: PosthogConfigResponse = { key, host };
  return Response.json(body, { headers: NO_STORE });
}
