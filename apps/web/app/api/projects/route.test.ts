import { PLAN_LIMITS, publicKeySchema } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakePostgrest,
  PUBLISHABLE_KEY,
  SECRET_KEY,
  SUPABASE_URL,
  tokenFor,
  type FakePostgrest,
} from "../../../lib/projects/fake-postgrest";

// Real route → lib/projects → lib/accounts → lib/supabase clients → supabase-js.
// Only Clerk's auth() and the network (a fake PostgREST with RLS) are faked.
vi.mock("server-only", () => ({}));
let signedInAs: string | null = null;
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    isAuthenticated: signedInAs !== null,
    userId: signedInAs,
    getToken: async () => (signedInAs ? tokenFor(signedInAs) : null),
  }),
}));

// PostHog: the real lib/analytics/server.ts, with posthog-node's network
// call recorded. after() has no request here, so events go out at once.
type SentEvent = { distinctId: string; event: string; properties?: Record<string, unknown> };
const captureImmediate = vi.fn(async (_event: SentEvent) => {});
vi.mock("posthog-node", () => ({
  PostHog: vi.fn(function (this: object) {
    Object.assign(this, { captureImmediate });
  }),
}));
/** The PostHog events sent so far (after pending sends run). */
const sentEvents = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  return captureImmediate.mock.calls.map(([event]) => event);
};

const { GET, POST } = await import("./route");

const ALICE = "user_alice";
const BOB = "user_bob";
let db: FakePostgrest;

beforeEach(() => {
  db = createFakePostgrest();
  vi.stubGlobal("fetch", db.fetch);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubEnv(["SUPABASE", "SECRET", "KEY"].join("_"), SECRET_KEY);
  signedInAs = ALICE;
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
  captureImmediate.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function post(body: unknown, raw = false): Promise<Response> {
  return POST(
    new Request("https://askwell.test/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw ? String(body) : JSON.stringify(body),
    }),
  );
}

async function createAs(user: string, name: string) {
  signedInAs = user;
  const res = await post({ name });
  return { res, body: await res.json() };
}

function expectNoCors(res: Response) {
  expect(res.headers.get("access-control-allow-origin")).toBeNull();
}

describe("POST /api/projects", () => {
  it("sends project_created once, under the owner's Clerk ID, after the project exists", async () => {
    const { project } = await (await post({ name: "Docs bot" })).json();
    expect(await sentEvents()).toEqual([
      { distinctId: ALICE, event: "project_created", properties: { project_id: project.id } },
    ]);
  });

  it("sends no project_created when creating fails (plan limit, bad body)", async () => {
    expect((await post({ name: "First" })).status).toBe(201);
    captureImmediate.mockClear();
    expect((await post({ name: "Second" })).status).toBe(403);
    expect((await post({ name: "" })).status).toBe(400);
    expect(await sentEvents()).toEqual([]);
  });

  it("an analytics failure doesn't change the response", async () => {
    captureImmediate.mockRejectedValue(new Error("PostHog is down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await post({ name: "Docs bot" });
    expect(res.status).toBe(201);
    expect((await res.json()).project.name).toBe("Docs bot");
    await sentEvents();
    vi.mocked(console.error).mockRestore();
  });

  it("creates a project: 201 { project } with a pk_ key and a default config row", async () => {
    const res = await post({ name: "  Docs bot  " });
    expect(res.status).toBe(201);
    const { project } = await res.json();
    expect(project).toMatchObject({ owner_id: ALICE, name: "Docs bot", messages_used: 0 });
    expect(Object.keys(project).sort()).toEqual(
      ["created_at", "id", "messages_used", "name", "owner_id", "period_start", "public_key"],
    );
    expect(project.public_key).toMatch(/^pk_[A-Za-z0-9_-]{32}$/);
    expect(publicKeySchema.safeParse(project.public_key).success).toBe(true);
    expect(db.configs.has(project.id)).toBe(true);
    expectNoCors(res);
  });

  it("creates the account row first, reads the plan with the owner client, and creates through the service client", async () => {
    await post({ name: "Docs bot" });
    const calls = db.requests.map((r) => `${r.method} ${r.path} as ${r.caller.kind}`);
    expect(calls).toEqual([
      "POST accounts as service",
      "GET accounts as owner",
      "POST rpc/create_project as service",
    ]);
    const rpc = db.requests.find((r) => r.path === "rpc/create_project");
    expect(rpc?.body).toMatchObject({ p_owner_id: ALICE, p_name: "Docs bot", p_max_projects: 1 });
  });

  it("gives every project a different key", async () => {
    db.accounts.set(ALICE, "pro");
    const keys = new Set<string>();
    for (let i = 0; i < 5; i++) keys.add((await (await post({ name: `P${i}` })).json()).project.public_key);
    expect(keys.size).toBe(5);
  });

  it("Free: the second project gets 403 plan_limit_reached and nothing is created", async () => {
    expect((await post({ name: "First" })).status).toBe(201);
    const res = await post({ name: "Second" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: {
        code: "plan_limit_reached",
        message: "Your Free plan allows 1 project. Upgrade to Pro for more.",
      },
    });
    expect(db.projects).toHaveLength(1);
  });

  it("Pro: five projects, then 403 plan_limit_reached", async () => {
    db.accounts.set(ALICE, "pro");
    for (let i = 0; i < PLAN_LIMITS.pro.projects; i++) expect((await post({ name: `P${i}` })).status).toBe(201);
    const res = await post({ name: "Sixth" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: "plan_limit_reached", message: "Your Pro plan allows 5 projects." },
    });
    expect(db.projects).toHaveLength(5);
  });

  it("limits each owner separately", async () => {
    expect((await createAs(ALICE, "Alice's")).res.status).toBe(201);
    expect((await createAs(BOB, "Bob's")).res.status).toBe(201);
  });

  it("can't be talked into a higher limit: a plan in the body is rejected", async () => {
    const res = await post({ name: "Sneaky", plan: "pro" });
    expect(res.status).toBe(400);
    expect(db.requests).toHaveLength(0);
  });

  it("retries with a new key on a public key collision", async () => {
    const realFetch = db.fetch;
    let first = true;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (first && String(input).endsWith("/rpc/create_project")) {
        first = false;
        db.takenKeys.add(JSON.parse(String(init?.body)).p_public_key);
      }
      return realFetch(input, init);
    });
    const res = await post({ name: "Docs bot" });
    expect(res.status).toBe(201);
    const keys = db.requests.filter((r) => r.path === "rpc/create_project").map((r) => (r.body as { p_public_key: string }).p_public_key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("returns 401 without a session, before reading the body or the database", async () => {
    signedInAs = null;
    const res = await post({ name: "Docs bot" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
    expect(db.requests).toHaveLength(0);
  });

  it.each([
    ["no name", {}],
    ["an empty name", { name: "   " }],
    ["a 61-character name", { name: "x".repeat(61) }],
    ["a non-string name", { name: 42 }],
    ["an extra field", { name: "Docs bot", owner_id: BOB }],
  ])("returns 400 validation_failed for %s, without touching the database", async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "validation_failed", message: expect.any(String) } });
    expect(db.requests).toHaveLength(0);
  });

  it("returns 400 for a body that isn't JSON", async () => {
    const res = await post("{not json", true);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "validation_failed", message: "Send a JSON body." } });
  });

  it("returns 500 internal without details when the database fails", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ code: "XX000", message: "secret detail" }), { status: 500 }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ name: "Docs bot" });
    spy.mockRestore();
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ error: { code: "internal" } });
    expect(text).not.toContain("secret detail");
  });
});

describe("GET /api/projects", () => {
  it("lists only the caller's projects, newest first, with the owner client", async () => {
    db.accounts.set(ALICE, "pro");
    await createAs(ALICE, "Older");
    await createAs(BOB, "Bob's");
    await createAs(ALICE, "Newer");

    signedInAs = ALICE;
    db.requests.length = 0;
    const res = await GET();
    expect(res.status).toBe(200);
    const { projects } = await res.json();
    expect(projects.map((p: { name: string }) => p.name)).toEqual(["Newer", "Older"]);
    expect(db.requests.map((r) => r.caller.kind)).toEqual(["owner"]);
    expectNoCors(res);
  });

  it("returns an empty list for a new owner", async () => {
    expect(await (await GET()).json()).toEqual({ projects: [] });
  });

  it("returns 401 without a session", async () => {
    signedInAs = null;
    const res = await GET();
    expect(res.status).toBe(401);
    expect(db.requests).toHaveLength(0);
  });
});
