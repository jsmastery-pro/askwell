// @vitest-environment node
import { WIDGET_DEFAULTS } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Arcjet is mocked at the SDK boundary (no network); the real limiter in lib/rate-limit runs.
type Conclusion = "ALLOW" | "DENY" | "ERROR";
const arcjet = vi.hoisted(() => ({ conclusion: "ALLOW" as Conclusion, protect: vi.fn() }));
vi.mock("@arcjet/next", () => ({
  default: () => ({ protect: arcjet.protect }),
  fixedWindow: () => [],
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

// getWidgetConfigByKey runs through the service client (SB-T05): one fake project per key, keyed
// the same way the route does (public_key -> project -> account + widget_configs).
type Row = Record<string, unknown> | null;
const fake = vi.hoisted(() => ({
  projects: {} as Record<string, Row>,
  account: null as Row,
  config: null as Row,
  throwOnLookup: false,
}));

function from(table: string) {
  if (fake.throwOnLookup) throw new Error("database down");
  if (table === "projects") {
    return { select: () => ({ eq: (_col: string, key: string) => ({ maybeSingle: async () => ({ data: fake.projects[key] ?? null, error: null }) }) }) };
  }
  if (table === "accounts") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.account, error: null }) }) }) };
  if (table === "widget_configs") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.config, error: null }) }) }) };
  throw new Error(`unexpected table ${table}`);
}
vi.mock("../../../../lib/supabase/service", () => ({ createServiceClient: () => ({ from }) }));

beforeEach(() => {
  vi.stubEnv("ARCJET_KEY", "ajkey_test");
  // Requests arrive as on Vercel, which sets x-real-ip to the client IP.
  vi.stubEnv("VERCEL", "1");
  arcjet.conclusion = "ALLOW";
  fake.projects = {
    pk_free: { id: "proj_free", owner_id: "owner_free" },
    pk_pro: { id: "proj_pro", owner_id: "owner_pro" },
  };
  fake.account = null;
  fake.config = { button_color: "#ff0000", position: "bottom-right", label: null, animation: "fade", header_text: null, show_badge: false };
  fake.throwOnLookup = false;
});

afterEach(() => vi.unstubAllEnvs());

const { GET, OPTIONS } = await import("./route");

let ip = 0;
function get(key: string | null, clientIp = `10.0.0.${++ip}`) {
  const url = new URL("https://app.test/api/widget/config");
  if (key !== null) url.searchParams.set("key", key);
  return GET(new Request(url, { headers: { Origin: "https://example.com", "x-real-ip": clientIp } }));
}

describe("GET /api/widget/config", () => {
  it("returns a Free project's defaults with the badge, ignoring stored values", async () => {
    fake.account = { plan: "free" };
    const res = await get("pk_free");
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ config: { ...WIDGET_DEFAULTS, showBadge: true } });
  });

  it("returns a Pro project's stored values", async () => {
    fake.account = { plan: "pro" };
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
      ipSrc: "10.7.7.7",
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
    fake.throwOnLookup = true;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get("pk_pro");
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong." } });
    logged.mockRestore();
  });

  it("answers the CORS preflight", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});
