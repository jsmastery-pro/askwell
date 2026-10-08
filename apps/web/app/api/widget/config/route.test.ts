// @vitest-environment node
import { RATE_LIMITS, WIDGET_DEFAULTS } from "@askwell/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, seedProject, type TestDb } from "../../../../lib/widget-config/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@askwell/db/client", () => ({
  get db() {
    return state.db;
  },
}));

const { GET, OPTIONS } = await import("./route");

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
  await seedProject(db, { plan: "free", publicKey: "pk_free", config: { buttonColor: "#ff0000", showBadge: false } });
  await seedProject(db, { plan: "pro", publicKey: "pk_pro", config: { buttonColor: "#ff0000", showBadge: false } });
});

afterAll(() => close());

let ip = 0;
function get(key: string | null, clientIp = `10.0.0.${++ip}`) {
  const url = new URL("https://app.test/api/widget/config");
  if (key !== null) url.searchParams.set("key", key);
  return GET(new Request(url, { headers: { Origin: "https://example.com", "cf-connecting-ip": clientIp } }));
}

describe("GET /api/widget/config", () => {
  it("returns a Free project's defaults with the badge, ignoring stored values", async () => {
    const res = await get("pk_free");
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ config: { ...WIDGET_DEFAULTS, showBadge: true } });
  });

  it("returns a Pro project's stored values", async () => {
    const { config } = await (await get("pk_pro")).json();
    expect(config.buttonColor).toBe("#ff0000");
    expect(config.showBadge).toBe(false);
  });

  it("returns 404 with no project data for an unknown key", async () => {
    const res = await get("pk_missing");
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Widget not found." } });
  });

  it("returns 400 for a missing or malformed key", async () => {
    for (const key of [null, "abc"]) {
      const res = await get(key);
      expect(res.status).toBe(400);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
  });

  it("returns 429 past the limit, with Retry-After and CORS", async () => {
    const statuses = [];
    for (let i = 0; i < RATE_LIMITS.widgetConfig.max; i++) {
      statuses.push((await get("pk_pro", "10.9.9.9")).status);
    }
    expect(statuses.every((s) => s === 200)).toBe(true);
    // Request max + 1: the first one over the limit.
    const res = await get("pk_pro", "10.9.9.9");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("answers the CORS preflight", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});
