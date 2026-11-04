import { createClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

// "server-only" throws outside a React Server Components build; stub it.
vi.mock("server-only", () => ({}));

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));
// connection(): resolved by default; a test can hold it open, as a
// prerender does, to check that nothing runs before the request arrives.
let connectionGate: Promise<void> = Promise.resolve();
const connection = vi.fn(() => connectionGate);
vi.mock("next/server", () => ({ connection: () => connection() }));

// The real supabase-js clients, with fetch recorded, so the tests see the
// exact requests ensureAccount() and getOwnPlan() send.
interface Request_ {
  client: "service" | "owner";
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
}
const requests: Request_[] = [];
let respond: (req: Request_) => Response = () => new Response(null, { status: 201 });

function recordingClient(client: Request_["client"]) {
  return createClient<Database>("https://example.supabase.co", `${client}-key`, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const req: Request_ = {
          client,
          method: init?.method ?? "GET",
          url: new URL(String(input)),
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
          body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        };
        requests.push(req);
        return respond(req);
      },
    },
  });
}

class FakeUnauthorizedError extends Error {}
const createServiceClient = vi.fn(() => recordingClient("service"));
const createOwnerClient = vi.fn(async () => recordingClient("owner"));
vi.mock("../supabase/service", () => ({ createServiceClient: () => createServiceClient() }));
vi.mock("../supabase/owner", () => ({
  createOwnerClient: () => createOwnerClient(),
  UnauthorizedError: FakeUnauthorizedError,
}));

const { AccountError, ensureAccount, getOwnPlan, loadOwnPlan, parsePlan } = await import("./account");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Lets every pending promise callback run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  connectionGate = Promise.resolve();
  connection.mockClear();
  requests.length = 0;
  respond = () => new Response(null, { status: 201 });
  authMock.mockReset();
  createServiceClient.mockClear();
  createOwnerClient.mockClear();
});

describe("ensureAccount", () => {
  it("throws unauthorized and writes nothing without a session", async () => {
    authMock.mockResolvedValue({ isAuthenticated: false, userId: null });
    await expect(ensureAccount()).rejects.toBeInstanceOf(FakeUnauthorizedError);
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });

  it("inserts the Clerk user's row and ignores an existing one", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_1" });
    await expect(ensureAccount()).resolves.toBe("user_1");

    expect(requests).toHaveLength(1);
    const [req] = requests;
    expect(req?.client).toBe("service");
    expect(req?.method).toBe("POST");
    expect(req?.url.pathname).toBe("/rest/v1/accounts");
    expect(req?.url.searchParams.get("on_conflict")).toBe("clerk_user_id");
    // ON CONFLICT DO NOTHING, not a merge.
    expect(req?.headers.prefer).toContain("resolution=ignore-duplicates");
    expect(req?.headers.prefer).not.toContain("merge-duplicates");
    // Only the user ID: the plan comes from the column default, never from here.
    expect(req?.body).toEqual({ clerk_user_id: "user_1" });
  });

  it("never overwrites the plan on a repeat call", async () => {
    // A tiny accounts table with Postgres' upsert semantics for these headers.
    const rows = new Map<string, { plan: string }>([["user_1", { plan: "pro" }]]);
    respond = (req) => {
      const { clerk_user_id, plan } = req.body as { clerk_user_id: string; plan?: string };
      const ignore = req.headers.prefer?.includes("resolution=ignore-duplicates");
      if (!rows.has(clerk_user_id) || !ignore) rows.set(clerk_user_id, { plan: plan ?? "free" });
      return new Response(null, { status: 201 });
    };
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_1" });

    await ensureAccount();
    await ensureAccount();

    expect(requests).toHaveLength(2);
    expect(rows.get("user_1")).toEqual({ plan: "pro" });
  });

  it("throws AccountError when the write fails", async () => {
    respond = () => json({ code: "42501", message: "permission denied" }, 403);
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_1" });
    await expect(ensureAccount()).rejects.toBeInstanceOf(AccountError);
  });
});

describe("getOwnPlan", () => {
  it("reads with the owner client and lets RLS scope the row", async () => {
    respond = () => json({ plan: "free" });
    await expect(getOwnPlan()).resolves.toBe("free");

    expect(createOwnerClient).toHaveBeenCalledOnce();
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    const [req] = requests;
    expect(req?.client).toBe("owner");
    expect(req?.method).toBe("GET");
    expect(req?.url.pathname).toBe("/rest/v1/accounts");
    // No manual owner filter: only the column list.
    expect([...(req?.url.searchParams.keys() ?? [])]).toEqual(["select"]);
    expect(req?.url.searchParams.get("select")).toBe("plan");
  });

  it("throws AccountError when the row isn't visible", async () => {
    respond = () => json([]);
    await expect(getOwnPlan()).rejects.toBeInstanceOf(AccountError);
  });

  it("passes on unauthorized from the owner client", async () => {
    createOwnerClient.mockRejectedValueOnce(new FakeUnauthorizedError());
    await expect(getOwnPlan()).rejects.toBeInstanceOf(FakeUnauthorizedError);
    expect(requests).toHaveLength(0);
  });
});

describe("parsePlan", () => {
  it("accepts the plans in PLANS", () => {
    expect(parsePlan("free")).toBe("free");
    expect(parsePlan("pro")).toBe("pro");
  });

  it("rejects anything else", () => {
    expect(() => parsePlan("enterprise")).toThrow(AccountError);
  });
});

describe("loadOwnPlan", () => {
  it("waits for the request (connection()) before any auth read or fetch, then upserts and reads the plan", async () => {
    let arrive = () => undefined as void;
    connectionGate = new Promise<void>((resolve) => (arrive = resolve));
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_1" });
    respond = (req) => (req.client === "owner" ? json({ plan: "pro" }) : new Response(null, { status: 201 }));

    const plan = loadOwnPlan();
    await flush();
    expect(connection).toHaveBeenCalledOnce();
    expect(authMock).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);

    arrive();
    expect(await plan).toBe("pro");
    expect(requests.map((r) => `${r.client} ${r.method} ${r.url.pathname}`)).toEqual([
      "service POST /rest/v1/accounts",
      "owner GET /rest/v1/accounts",
    ]);
  });
});
