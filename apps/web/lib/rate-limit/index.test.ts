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

// A request as Vercel delivers it: x-real-ip is the client IP Vercel sets.
function request(ip = "203.0.113.7") {
  return new Request("https://app.test/api/widget/config?key=pk_test", { headers: { "x-real-ip": ip } });
}

beforeEach(() => {
  vi.stubEnv("ARCJET_KEY", "ajkey_test");
  vi.stubEnv("VERCEL", "1");
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

describe("checkRateLimit with forged IP headers", () => {
  it("counts by the IP Vercel reports, ignoring a forged cf-connecting-ip and x-forwarded-for", async () => {
    arcjet.protect.mockResolvedValue(decision({ conclusion: "ALLOW" }));
    const forged = new Request("https://app.test/api/widget/chat", {
      headers: { "x-real-ip": "203.0.113.50", "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "7.7.7.7, 8.8.8.8" },
    });
    await checkRateLimit(forged, "widgetChat", "pk_abc");
    expect(arcjet.protect).toHaveBeenCalledWith(forged, {
      route: "widgetChat",
      publicKey: "pk_abc",
      clientIp: "203.0.113.50",
      ipSrc: "203.0.113.50",
    });
  });
});

describe("getClientIp", () => {
  const onVercel = { VERCEL: "1" };

  it("reads x-real-ip on Vercel, the header Vercel sets", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "203.0.113.7" }), onVercel)).toBe("203.0.113.7");
    expect(getClientIp(new Headers({ "x-real-ip": " 2001:db8::1 " }), onVercel)).toBe("2001:db8::1");
  });

  it("ignores a forged cf-connecting-ip, even with no x-real-ip", () => {
    const headers = new Headers({ "cf-connecting-ip": "6.6.6.6", "x-real-ip": "203.0.113.7" });
    expect(getClientIp(headers, onVercel)).toBe("203.0.113.7");
    expect(getClientIp(new Headers({ "cf-connecting-ip": "6.6.6.6" }), onVercel)).toBe("unknown");
  });

  it("ignores client-sent x-forwarded-for: Vercel overwrites it, and we don't read it", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 7.7.7.7", "x-real-ip": "203.0.113.7" });
    expect(getClientIp(headers, onVercel)).toBe("203.0.113.7");
    expect(getClientIp(new Headers({ "x-forwarded-for": "6.6.6.6" }), onVercel)).toBe("unknown");
  });

  it("off Vercel, trusts no header at all: everything shares one fixed key", () => {
    const forged = new Headers({ "x-real-ip": "6.6.6.6", "cf-connecting-ip": "7.7.7.7", "x-forwarded-for": "8.8.8.8" });
    expect(getClientIp(forged, {})).toBe("unknown");
    expect(getClientIp(forged, { VERCEL: "0" })).toBe("unknown");
  });

  it("uses the fixed key when x-real-ip isn't an IP address", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "not-an-ip" }), onVercel)).toBe("unknown");
    expect(getClientIp(new Headers({ "x-real-ip": "1.2.3.4, 5.6.7.8" }), onVercel)).toBe("unknown");
    expect(getClientIp(new Headers(), onVercel)).toBe("unknown");
  });

  it("reads process.env by default", () => {
    vi.stubEnv("VERCEL", "1");
    expect(getClientIp(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    vi.stubEnv("VERCEL", "");
    expect(getClientIp(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("unknown");
  });
});
