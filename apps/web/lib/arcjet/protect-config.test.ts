import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG_RATE_LIMIT } from "@askwell/shared";

// "server-only" throws outside a React Server Components build; stub it.
// Arcjet is mocked: the rule factories record their options, and protect()
// returns whatever decision the test sets.
vi.mock("server-only", () => ({}));
const protect = vi.fn();
const arcjetFactory = vi.fn((_options: unknown) => ({ protect }));
const fixedWindow = vi.fn((options: unknown) => [{ type: "RATE_LIMIT", options }]);
const detectPromptInjection = vi.fn((options: unknown) => [{ type: "PROMPT_INJECTION", options }]);
vi.mock("@arcjet/next", () => ({
  default: (options: unknown) => arcjetFactory(options),
  fixedWindow: (options: unknown) => fixedWindow(options),
  detectPromptInjection: (options: unknown) => detectPromptInjection(options),
}));

const { protectConfig, resetConfigArcjetForTests } = await import("./protect-config");

type ReasonKind = "RATE_LIMIT" | "SHIELD" | "ERROR" | null;

/** A fake ArcjetDecision with the methods protectConfig uses. */
function decision(conclusion: "ALLOW" | "DENY" | "ERROR", reason: ReasonKind = null) {
  return {
    conclusion,
    isDenied: () => conclusion === "DENY",
    isErrored: () => conclusion === "ERROR",
    reason: {
      type: reason,
      message: reason === "ERROR" ? "Decide API timed out" : undefined,
      isRateLimit: () => reason === "RATE_LIMIT",
    },
  };
}

const req = { headers: new Headers({ "x-real-ip": "203.0.113.7" }) } as unknown as Parameters<
  typeof protectConfig
>[0];
const INPUT = { publicKey: "pk_test_123" };

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubEnv("ARCJET_KEY", "ajkey_test");
  resetConfigArcjetForTests();
  protect.mockReset();
  arcjetFactory.mockClear();
  fixedWindow.mockClear();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  warn.mockRestore();
});

describe("protectConfig", () => {
  it("allows a normal request and passes the public key to Arcjet", async () => {
    protect.mockResolvedValueOnce(decision("ALLOW"));
    expect(await protectConfig(req, INPUT)).toEqual({ allowed: true });
    expect(protect).toHaveBeenCalledExactlyOnceWith(req, { publicKey: "pk_test_123" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("blocks a rate-limited request", async () => {
    protect.mockResolvedValueOnce(decision("DENY", "RATE_LIMIT"));
    expect(await protectConfig(req, INPUT)).toEqual({ allowed: false, reason: "rate_limit" });
  });

  it("fails open and logs when Arcjet throws", async () => {
    protect.mockRejectedValueOnce(new Error("network down"));
    expect(await protectConfig(req, INPUT)).toEqual({ allowed: true });
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/fail open/);
  });

  it("fails open and logs when the decision is an error (e.g. timeout)", async () => {
    protect.mockResolvedValueOnce(decision("ERROR", "ERROR"));
    expect(await protectConfig(req, INPUT)).toEqual({ allowed: true });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[1]).toBe("Decide API timed out");
  });

  it("fails open and logs without ARCJET_KEY", async () => {
    vi.stubEnv("ARCJET_KEY", "");
    expect(await protectConfig(req, INPUT)).toEqual({ allowed: true });
    expect(protect).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("allows and logs a denial for a reason this rule doesn't produce", async () => {
    protect.mockResolvedValueOnce(decision("DENY", "SHIELD"));
    expect(await protectConfig(req, INPUT)).toEqual({ allowed: true });
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("Arcjet client", () => {
  it("rate limits per public key + IP with CONFIG_RATE_LIMIT, LIVE, and no injection rule", async () => {
    protect.mockResolvedValue(decision("ALLOW"));
    await protectConfig(req, INPUT);
    await protectConfig(req, INPUT);

    // One client per process (shared decision cache), keyed with ARCJET_KEY.
    expect(arcjetFactory).toHaveBeenCalledOnce();
    expect(arcjetFactory.mock.calls[0]?.[0]).toMatchObject({ key: "ajkey_test" });
    expect(fixedWindow).toHaveBeenCalledExactlyOnceWith({
      mode: "LIVE",
      characteristics: ["publicKey", "ip.src"],
      window: CONFIG_RATE_LIMIT.windowSeconds,
      max: CONFIG_RATE_LIMIT.max,
    });
    expect(CONFIG_RATE_LIMIT).toEqual({ max: 60, windowSeconds: 60 });
    expect(detectPromptInjection).not.toHaveBeenCalled();
  });

  it("is server only and never reads a public variable", () => {
    const source = readFileSync(new URL("./protect-config.ts", import.meta.url), "utf8");
    expect(source).toMatch(/^import "server-only";$/m);
    expect(source).not.toMatch(/NEXT_PUBLIC_/);
  });
});
