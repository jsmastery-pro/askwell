// Arcjet protection for GET /api/widget/config (project.md §3 Security, §8
// Public, §9 Cost abuse): a fixed-window rate limit per public key + client IP.
// No prompt injection rule: the route takes no text.
//
// Fails open (§3): an Arcjet error, timeout or missing key lets the request
// through and logs a warning.
//
// Server only: ARCJET_KEY is a secret (§11), read at first use.
import "server-only";
import arcjet, { fixedWindow, type ArcjetDecision, type ArcjetNextRequest } from "@arcjet/next";
import { CONFIG_RATE_LIMIT } from "@askwell/shared";
import { requireEnv } from "../supabase/env";

export type ConfigProtection = { allowed: true } | { allowed: false; reason: "rate_limit" };

/** Builds the client. One per process, so requests share Arcjet's decision cache. */
function createConfigArcjet() {
  return arcjet({
    key: requireEnv("ARCJET_KEY", process.env.ARCJET_KEY),
    rules: [
      fixedWindow({
        mode: "LIVE",
        // "publicKey" is a custom characteristic passed to protect(); "ip.src"
        // is the client IP Arcjet detects (Vercel's trusted header in prod).
        characteristics: ["publicKey", "ip.src"],
        window: CONFIG_RATE_LIMIT.windowSeconds,
        max: CONFIG_RATE_LIMIT.max,
      }),
    ],
  });
}

let client: ReturnType<typeof createConfigArcjet> | null = null;
function configArcjet() {
  client ??= createConfigArcjet();
  return client;
}

/**
 * Runs the config route's rate limit once for this request. Call it before
 * the database read; a limited request must not reach it.
 */
export async function protectConfig(
  req: ArcjetNextRequest,
  { publicKey }: { publicKey: string },
): Promise<ConfigProtection> {
  let decision: ArcjetDecision;
  try {
    decision = await configArcjet().protect(req, { publicKey });
  } catch (error) {
    // protect() is documented not to throw; a missing key or a bad config can.
    console.warn("[arcjet] protectConfig failed; allowing the request (fail open).", error);
    return { allowed: true };
  }

  if (decision.isErrored()) {
    console.warn(
      "[arcjet] protectConfig errored; allowing the request (fail open).",
      decision.reason.message,
    );
    return { allowed: true };
  }

  if (!decision.isDenied()) return { allowed: true };

  if (decision.reason.isRateLimit()) return { allowed: false, reason: "rate_limit" };

  console.warn("[arcjet] protectConfig denied for an unexpected reason; allowing.", decision.reason.type);
  return { allowed: true };
}

/** Test only: forget the cached client so the next call rebuilds it. */
export function resetConfigArcjetForTests(): void {
  client = null;
}
