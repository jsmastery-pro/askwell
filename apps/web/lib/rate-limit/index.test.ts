// @vitest-environment node
import { rateLimits } from "@askwell/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../widget-config/test-db";
import { checkRateLimit, getClientIp } from "./index";

const limit = { windowSeconds: 60, max: 3 };

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(() => close());

describe("checkRateLimit", () => {
  it("allows up to max calls in a window, then refuses", async () => {
    const results = [];
    for (let i = 0; i < limit.max + 1; i++) results.push(await checkRateLimit("k1", limit, db));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.at(-1)!.retryAfterSeconds).toBeGreaterThan(0);
    expect(results.at(-1)!.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("counts keys separately", async () => {
    expect((await checkRateLimit("k2", limit, db)).allowed).toBe(true);
  });

  it("resets the window in place once it expires", async () => {
    await db
      .update(rateLimits)
      .set({ windowStart: sql`now() - interval '61 seconds'` })
      .where(eq(rateLimits.key, "k1"));
    expect((await checkRateLimit("k1", limit, db)).allowed).toBe(true);
    const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, "k1"));
    expect(row?.count).toBe(1);
  });
});

describe("getClientIp", () => {
  it("prefers x-real-ip", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
  });

  it("uses the last x-forwarded-for hop, not the spoofable first one", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 3.3.3.3" }))).toBe("3.3.3.3");
  });

  it("falls back to a fixed string instead of skipping the limit", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
