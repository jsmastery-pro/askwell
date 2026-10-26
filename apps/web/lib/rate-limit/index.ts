import { RATE_LIMITS } from "@askwell/shared";
import arcjet, { fixedWindow, type ArcjetDecision } from "@arcjet/next";
import { isIP } from "node:net";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/** A public widget route with its own limit in RATE_LIMITS. */
export type RateLimitedRoute = keyof typeof RATE_LIMITS;

// Counted per route + public key + client IP. The IP is our own characteristic, from the one
// header the platform (Vercel) sets itself; see getClientIp.
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
    const clientIp = getClientIp(request.headers);
    const decision = await client.protect(request, {
      route,
      publicKey,
      clientIp,
      // Hands Arcjet's own IP analysis the IP we trust instead of its own guess. Only a real
      // address: Arcjet throws on anything else, and a throw here would fail open.
      ...(isIP(clientIp) ? { ipSrc: clientIp } : {}),
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
 * The client IP for the per-IP limit, read only from what the platform sets, never from a header
 * the client controls (§9 Cost abuse).
 *
 * On Vercel (`VERCEL=1`, a system env var at build and runtime), `x-real-ip`: Vercel overwrites
 * `x-forwarded-for` "to prevent IP spoofing", and `x-real-ip` is identical to it
 * (https://vercel.com/docs/headers/request-headers). It's also the header @vercel/functions'
 * `ipAddress()` reads. `cf-connecting-ip` is never read: nothing strips it off Cloudflare.
 *
 * Anywhere else (local dev, any other host) every header is client-controlled, so all requests
 * share one fixed key. That's stricter, never bypassable.
 */
export function getClientIp(headers: Headers, env: Record<string, string | undefined> = process.env): string {
  if (env["VERCEL"] === "1") {
    const ip = headers.get("x-real-ip")?.trim();
    if (ip && isIP(ip)) return ip;
  }
  return "unknown";
}
