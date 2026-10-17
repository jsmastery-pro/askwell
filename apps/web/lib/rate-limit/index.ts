import { RATE_LIMITS } from "@askwell/shared";
import arcjet, { fixedWindow, type ArcjetDecision } from "@arcjet/next";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/** A public widget route with its own limit in RATE_LIMITS. */
export type RateLimitedRoute = keyof typeof RATE_LIMITS;

// Counted per route + public key + client IP. The IP is our own characteristic, not Arcjet's
// ip.src: behind InstaCloud's Cloudflare edge, getClientIp knows which header to trust.
const CHARACTERISTICS = ["route", "publicKey", "clientIp"] as const;

function createClient(key: string, route: RateLimitedRoute) {
  const { windowSeconds, max } = RATE_LIMITS[route];
  return arcjet({
    key,
    characteristics: CHARACTERISTICS,
    rules: [fixedWindow({ mode: "LIVE", window: windowSeconds, max })],
  });
}

const clients = new Map<RateLimitedRoute, ReturnType<typeof createClient>>();
let warnedNoKey = false;

function getClient(route: RateLimitedRoute) {
  const key = process.env.ARCJET_KEY;
  if (!key) return null;
  let client = clients.get(route);
  if (!client) {
    client = createClient(key, route);
    clients.set(route, client);
  }
  return client;
}

const ALLOW: RateLimitResult = { allowed: true, retryAfterSeconds: 0 };

function retryAfter(decision: ArcjetDecision, route: RateLimitedRoute): number {
  const reason = decision.reason;
  if (reason.isRateLimit()) {
    const seconds = reason.resetTime ? (reason.resetTime.getTime() - Date.now()) / 1000 : reason.reset;
    return Math.max(1, Math.ceil(seconds));
  }
  return RATE_LIMITS[route].windowSeconds;
}

/**
 * Fixed-window limit on Arcjet. Fails open: a missing key, an Arcjet error or a timeout lets
 * the request through and logs it, so an Arcjet outage never takes the widget down (§3).
 */
export async function checkRateLimit(
  request: Request,
  route: RateLimitedRoute,
  publicKey: string,
): Promise<RateLimitResult> {
  try {
    const client = getClient(route);
    if (!client) {
      if (!warnedNoKey) console.error("ARCJET_KEY is not set: widget rate limits are off");
      warnedNoKey = true;
      return ALLOW;
    }
    const decision = await client.protect(request, {
      route,
      publicKey,
      clientIp: getClientIp(request.headers),
    });
    if (decision.isErrored()) {
      console.error("Arcjet rate limit check failed, allowing the request", decision.reason.message);
      return ALLOW;
    }
    if (decision.isDenied()) return { allowed: false, retryAfterSeconds: retryAfter(decision, route) };
    return ALLOW;
  } catch (error) {
    console.error("Arcjet rate limit check failed, allowing the request", error);
    return ALLOW;
  }
}

/**
 * Client IP from the platform's proxy headers. InstaCloud's edge is Cloudflare, which sets
 * cf-connecting-ip to the real client and overwrites client-sent forwarding headers.
 * Then x-real-ip, then the last x-forwarded-for hop (earlier hops are client-supplied).
 * Falls back to a fixed string so the limit is never skipped.
 */
export function getClientIp(headers: Headers): string {
  for (const name of ["cf-connecting-ip", "x-real-ip"]) {
    const ip = headers.get(name)?.trim();
    if (ip) return ip;
  }
  const lastHop = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return lastHop || "unknown";
}
