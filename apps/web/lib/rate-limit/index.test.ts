// @vitest-environment node
import { RATE_LIMITS } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Arcjet is mocked: no test calls the real Arcjet API.
const arcjet = vi.hoisted(() => ({ protect: vi.fn(), created: [] as unknown[] }));
vi.mock("@arcjet/next", () => ({
  default: (options: unknown) => {
    arcjet.created.push(options);
    return { protect: arcjet.protect };
  },
  fixedWindow: (options: unknown) => [{ type: "FIXED_WINDOW", ...(options as object) }],
}));

const { checkRateLimit, getClientIp } = await import("./index");

type Fake = { conclusion: "ALLOW" | "DENY" | "ERROR"; reason?: Record<string, unknown> };
function decision({ conclusion, reason = {} }: Fake) {
  return {
    conclusion,
    isErrored: () => conclusion === "ERROR",
    isDenied: () => conclusion === "DENY",
    reason: { ...reason, isRateLimit: () => reason.type === "RATE_LIMIT" },
  };
}

function request(ip = "203.0.113.7") {
  return new Request("https://app.test/api/widget/config?key=pk_test", { headers: { "cf-connecting-ip": ip } });
}

beforeEach(() => {
  vi.stubEnv("ARCJET_KEY", "ajkey_test");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(console.error).mockRestore();
  arcjet.protect.mockReset();
});

describe("checkRateLimit", () => {
  it("allows an allowed decision", async () => {
    arcjet.protect.mockResolvedValue(decision({ conclusion: "ALLOW" }));
    expect((await checkRateLimit(request(), "widgetConfig", "pk_test")).allowed).toBe(true);
  });

  it("counts per route + public key + client IP, using our IP rather than Arcjet's", async () => {
    arcjet.protect.mockResolvedValue(decision({ conclusion: "ALLOW" }));
    const req = request("198.51.100.4");
    await checkRateLimit(req, "widgetChat", "pk_abc");
    expect(arcjet.protect).toHaveBeenCalledWith(req, {
      route: "widgetChat",
      publicKey: "pk_abc",
      clientIp: "198.51.100.4",
      ipSrc: "198.51.100.4",
    });
  });

  it("gives Arcjet no ipSrc when the IP isn't a real address, and still checks the limit", async () => {
    arcjet.protect.mockResolvedValue(decision({ conclusion: "DENY", reason: { type: "RATE_LIMIT", reset: 5 } }));
    const req = new Request("https://app.test/api/widget/chat");

    expect((await checkRateLimit(req, "widgetChat", "pk_abc")).allowed).toBe(false);
    expect(arcjet.protect).toHaveBeenCalledWith(req, { route: "widgetChat", publicKey: "pk_abc", clientIp: "unknown" });
  });

  it("builds each route's fixed window from RATE_LIMITS, tracked by our characteristics", async () => {
    arcjet.protect.mockResolvedValue(decision({ conclusion: "ALLOW" }));
    await checkRateLimit(request(), "widgetConfig", "pk_test");
    await checkRateLimit(request(), "widgetChat", "pk_test");
    // One client per route, created on first use (possibly by an earlier test) and then reused.
    const { created } = arcjet;
    expect(created).toHaveLength(2);
    for (const route of ["widgetConfig", "widgetChat"] as const) {
      expect(created).toContainEqual({
        key: "ajkey_test",
        characteristics: ["route", "publicKey", "clientIp"],
        rules: [[{ type: "FIXED_WINDOW", mode: "LIVE", window: RATE_LIMITS[route].windowSeconds, max: RATE_LIMITS[route].max }]],
      });
    }
  });

  it("refuses a denied decision, with Retry-After from the reset time", async () => {
    arcjet.protect.mockResolvedValue(
      decision({ conclusion: "DENY", reason: { type: "RATE_LIMIT", reset: 40, resetTime: new Date(Date.now() + 12_300) } }),
    );
    expect(await checkRateLimit(request(), "widgetConfig", "pk_test")).toEqual({ allowed: false, retryAfterSeconds: 13 });
  });

  it("falls back to the reset seconds, and never says retry in under 1 second", async () => {
    arcjet.protect.mockResolvedValueOnce(decision({ conclusion: "DENY", reason: { type: "RATE_LIMIT", reset: 7 } }));
    expect((await checkRateLimit(request(), "widgetConfig", "pk_test")).retryAfterSeconds).toBe(7);
    arcjet.protect.mockResolvedValueOnce(decision({ conclusion: "DENY", reason: { type: "RATE_LIMIT", reset: 0 } }));
    expect((await checkRateLimit(request(), "widgetConfig", "pk_test")).retryAfterSeconds).toBe(1);
  });

  it("fails open on an Arcjet error decision, and logs it", async () => {
    arcjet.protect.mockResolvedValue(decision({ conclusion: "ERROR", reason: { type: "ERROR", message: "timeout" } }));
    expect((await checkRateLimit(request(), "widgetConfig", "pk_test")).allowed).toBe(true);
    expect(console.error).toHaveBeenCalled();
  });

  it("fails open when protect throws", async () => {
    arcjet.protect.mockRejectedValue(new Error("network down"));
    expect((await checkRateLimit(request(), "widgetConfig", "pk_test")).allowed).toBe(true);
    expect(console.error).toHaveBeenCalled();
  });

  it("fails open without ARCJET_KEY, without calling Arcjet", async () => {
    vi.stubEnv("ARCJET_KEY", "");
    expect((await checkRateLimit(request(), "widgetConfig", "pk_test")).allowed).toBe(true);
    expect(arcjet.protect).not.toHaveBeenCalled();
  });
});

describe("getClientIp", () => {
  it("prefers cf-connecting-ip, which InstaCloud's Cloudflare edge sets", () => {
    const headers = new Headers({
      "cf-connecting-ip": "103.0.0.1",
      "x-real-ip": "1.1.1.1",
      "x-forwarded-for": "162.158.9.143",
    });
    expect(getClientIp(headers)).toBe("103.0.0.1");
  });

  it("falls back to x-real-ip", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
  });

  it("uses the last x-forwarded-for hop, not the spoofable first one", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 3.3.3.3" }))).toBe("3.3.3.3");
  });

  it("falls back to a fixed string instead of skipping the limit", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
