// @vitest-environment node
import { WIDGET_DEFAULTS } from "@askwell/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedProject, type TestDb } from "../../../../lib/widget-config/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@askwell/db/client", () => ({
  get db() {
    return state.db;
  },
}));

// Arcjet is mocked at the SDK boundary (no network); the real limiter in lib/rate-limit runs.
type Conclusion = "ALLOW" | "DENY" | "ERROR";
const arcjet = vi.hoisted(() => ({ conclusion: "ALLOW" as Conclusion, protect: vi.fn() }));
vi.mock("@arcjet/next", () => ({
  default: () => ({ protect: arcjet.protect }),
  fixedWindow: () => [],
  cloudflare: () => ({}),
}));
arcjet.protect.mockImplementation(async () => {
  const { conclusion } = arcjet;
  const rateLimit = conclusion === "DENY";
  return {
    isErrored: () => conclusion === "ERROR",
    isDenied: () => rateLimit,
    reason: { isRateLimit: () => rateLimit, reset: 42, message: "Arcjet timed out" },
  };
});

beforeEach(() => {
  vi.stubEnv("ARCJET_KEY", "ajkey_test");
  arcjet.conclusion = "ALLOW";
});

afterEach(() => vi.unstubAllEnvs());

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

  it("returns 429 rate_limited on a denied decision, with Retry-After and CORS", async () => {
    arcjet.conclusion = "DENY";
    const res = await get("pk_pro", "10.9.9.9");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ error: { code: "rate_limited", message: "Too many requests. Try again shortly." } });
  });

  it("limits before the lookup, so unknown keys can't be probed past the limit", async () => {
    arcjet.conclusion = "DENY";
    expect((await get("pk_missing")).status).toBe(429);
  });

  it("checks the limit per public key and client IP", async () => {
    await get("pk_pro", "10.7.7.7");
    expect(arcjet.protect).toHaveBeenLastCalledWith(expect.any(Request), {
      route: "widgetConfig",
      publicKey: "pk_pro",
      clientIp: "10.7.7.7",
    });
  });

  it("lets the request through when Arcjet errors", async () => {
    arcjet.conclusion = "ERROR";
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await get("pk_pro")).status).toBe(200);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("returns a JSON 500 with CORS when the lookup fails (L6)", async () => {
    const realDb = state.db;
    state.db = {
      select: () => {
        throw new Error("database down");
      },
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await get("pk_pro");
      expect(res.status).toBe(500);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong." } });
    } finally {
      state.db = realDb;
      logged.mockRestore();
    }
  });

  it("answers the CORS preflight", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});
