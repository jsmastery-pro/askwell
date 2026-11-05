import { createClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Arcjet is mocked at the SDK, so the real protectConfig runs: protect() gives
// the decision each test sets (ALLOW by default) or throws.
type Decision = "ALLOW" | "RATE_LIMIT" | "ERROR";
let arcjetDecision: Decision | Error = "ALLOW";
const protect = vi.fn(async () => {
  if (arcjetDecision instanceof Error) throw arcjetDecision;
  const d = arcjetDecision;
  return {
    isDenied: () => d === "RATE_LIMIT",
    isErrored: () => d === "ERROR",
    reason: { type: d, message: "Decide API timed out", isRateLimit: () => d === "RATE_LIMIT" },
  };
});
vi.mock("@arcjet/next", () => ({
  default: () => ({ protect }),
  fixedWindow: (options: unknown) => [{ type: "RATE_LIMIT", options }],
}));

// The route runs for real down to supabase-js; only the service client's
// fetch is faked, so these tests cover parsing, lookup, plan rules and headers.
let respond: (url: URL) => Response = () => Response.json([]);
const fetched: URL[] = [];
vi.mock("../../../../lib/supabase/service", () => ({
  createServiceClient: () =>
    createClient<Database>("https://example.supabase.co", "service-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input: RequestInfo | URL) => {
          const url = new URL(String(input));
          fetched.push(url);
          return respond(url);
        },
      },
    }),
}));

const { GET, OPTIONS } = await import("./route");

const CUSTOM = {
  button_color: "#ff0066",
  position: "top-left",
  label: "Questions?",
  animation: "scale",
  header_text: "We're here",
  show_badge: false,
};

/** Answers like PostgREST: the project row for KNOWN_KEY, nothing for any other key. */
const KNOWN_KEY = "pk_known_123";
function projects(plan: "free" | "pro") {
  return (url: URL) =>
    url.searchParams.get("public_key") === `eq.${KNOWN_KEY}`
      ? Response.json([{ widget_configs: CUSTOM, accounts: { plan } }])
      : Response.json([]);
}

function get(query: string): Promise<Response> {
  const request = new NextRequest(`https://askwell.test/api/widget/config${query}`, {
    headers: { Origin: "https://customer.example.com" },
  });
  return GET(request);
}

function expectPublicCors(res: Response) {
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  expect(res.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  expect(res.headers.get("access-control-allow-credentials")).toBeNull();
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubEnv("ARCJET_KEY", "ajkey_test");
  fetched.length = 0;
  respond = projects("free");
  arcjetDecision = "ALLOW";
  protect.mockClear();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  warn.mockRestore();
});

describe("GET /api/widget/config rate limit", () => {
  it("allowed → 200, after one Arcjet check with the public key", async () => {
    const res = await get(`?key=${KNOWN_KEY}`);
    expect(res.status).toBe(200);
    expect(protect).toHaveBeenCalledOnce();
    expect(protect.mock.calls[0]).toEqual([expect.anything(), { publicKey: KNOWN_KEY }]);
  });

  it("limited → 429 rate_limited with the public CORS headers, before the database read", async () => {
    arcjetDecision = "RATE_LIMIT";
    const res = await get(`?key=${KNOWN_KEY}`);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: { code: "rate_limited", message: "Too many requests. Wait a minute, then try again." },
    });
    expectPublicCors(res);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fetched).toHaveLength(0);
  });

  it.each([
    ["throws", new Error("network down")],
    ["returns an error decision", "ERROR" as const],
  ])("Arcjet %s → fails open: 200 with the config", async (_label, failure) => {
    arcjetDecision = failure;
    const res = await get(`?key=${KNOWN_KEY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ config: DEFAULT_WIDGET_CONFIG });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("missing ARCJET_KEY → fails open: 200", async () => {
    vi.stubEnv("ARCJET_KEY", "");
    const { resetConfigArcjetForTests } = await import("../../../../lib/arcjet/protect-config");
    resetConfigArcjetForTests();
    const res = await get(`?key=${KNOWN_KEY}`);
    resetConfigArcjetForTests();
    expect(res.status).toBe(200);
  });

  it("a bad query is rejected with 400 without an Arcjet check", async () => {
    const res = await get("?key=nope");
    expect(res.status).toBe(400);
    expect(protect).not.toHaveBeenCalled();
  });

  it("the OPTIONS preflight isn't counted", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(protect).not.toHaveBeenCalled();
  });
});

describe("GET /api/widget/config", () => {
  it("gives a Free project the defaults and the badge, even with custom values stored", async () => {
    const res = await get(`?key=${KNOWN_KEY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ config: DEFAULT_WIDGET_CONFIG });
  });

  it("gives a Pro project its stored values", async () => {
    respond = projects("pro");
    const res = await get(`?key=${KNOWN_KEY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ config: CUSTOM });
  });

  it("returns only { config } with the 6 WidgetSettings fields (no owner, plan or ids)", async () => {
    respond = () =>
      Response.json([
        {
          widget_configs: { ...CUSTOM, project_id: "p1" },
          accounts: { plan: "pro", clerk_user_id: "user_1" },
          id: "p1",
          owner_id: "user_1",
        },
      ]);
    const body = await (await get(`?key=${KNOWN_KEY}`)).json();
    expect(Object.keys(body)).toEqual(["config"]);
    expect(Object.keys(body.config).sort()).toEqual(Object.keys(DEFAULT_WIDGET_CONFIG).sort());
    expect(JSON.stringify(body)).not.toMatch(/user_1|p1|pro|owner|plan/);
  });

  it("sends the public CORS headers and no-store on success", async () => {
    const res = await get(`?key=${KNOWN_KEY}`);
    expectPublicCors(res);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 404 not_found in the §8 shape for an unknown key, with CORS", async () => {
    const res = await get("?key=pk_nobody_has_this");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "not_found", message: "No widget uses this key." },
    });
    expectPublicCors(res);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers every unknown key identically", async () => {
    const a = await (await get("?key=pk_aaa")).text();
    const b = await (await get("?key=pk_zzz_other")).text();
    expect(a).toBe(b);
  });

  it.each([
    ["a missing key", ""],
    ["an empty key", "?key="],
    ["a key without the pk_ prefix", "?key=abc123"],
    ["a key with bad characters", "?key=pk_abc%3Bdrop"],
    ["a key that's too long", `?key=pk_${"a".repeat(200)}`],
    ["an extra parameter", `?key=${KNOWN_KEY}&owner=1`],
    ["a repeated key", `?key=${KNOWN_KEY}&key=pk_other`],
    ["a __proto__ parameter", `?key=${KNOWN_KEY}&__proto__=x`],
  ])("returns 400 validation_failed for %s, without touching the database", async (_label, query) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "validation_failed", message: expect.any(String) },
    });
    expectPublicCors(res);
    expect(fetched).toHaveLength(0);
  });

  it("returns 500 internal without leaking the database error", async () => {
    respond = () => Response.json({ message: "relation secret_table", code: "XX000" }, { status: 500 });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get(`?key=${KNOWN_KEY}`);
    spy.mockRestore();
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ error: { code: "internal" } });
    expect(text).not.toContain("secret_table");
    expectPublicCors(res);
  });
});

describe("OPTIONS /api/widget/config", () => {
  it("answers the CORS preflight with 204 and the public CORS headers", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expectPublicCors(res);
    expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type");
  });
});
