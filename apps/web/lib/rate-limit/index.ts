import { db as defaultDb } from "@askwell/db/client";
import type { Database } from "@askwell/db/queries";
import { rateLimits } from "@askwell/db";
import type { RateLimit } from "@askwell/shared";
import { sql } from "drizzle-orm";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/**
 * Fixed-window limit on the rate_limits table. One atomic upsert per call:
 * starts a window, counts within it, or resets it in place once it has expired.
 */
export async function checkRateLimit(
  key: string,
  limit: RateLimit,
  database: Database = defaultDb,
): Promise<RateLimitResult> {
  const window = sql`make_interval(secs => ${limit.windowSeconds})`;
  const expired = sql`${rateLimits.windowStart} <= now() - ${window}`;

  const [row] = await database
    .insert(rateLimits)
    .values({ key, windowStart: sql`now()`, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        windowStart: sql`CASE WHEN ${expired} THEN now() ELSE ${rateLimits.windowStart} END`,
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
      },
    })
    .returning({
      count: rateLimits.count,
      retryAfter: sql<number>`ceil(extract(epoch from (${rateLimits.windowStart} + ${window} - now())))::int`,
    });

  if (!row) throw new Error("rate limit upsert returned no row");
  return {
    allowed: row.count <= limit.max,
    retryAfterSeconds: Math.max(1, row.retryAfter),
  };
}

/**
 * Client IP from the platform's proxy headers. Prefers x-real-ip, then the last
 * x-forwarded-for hop (appended by the proxy; earlier hops are client-supplied and
 * spoofable). Falls back to a fixed string so the limit is never skipped.
 */
export function getClientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const lastHop = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return lastHop || "unknown";
}
