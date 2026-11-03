import type { Project } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakePostgrest,
  PUBLISHABLE_KEY,
  SECRET_KEY,
  SUPABASE_URL,
  tokenFor,
  type FakePostgrest,
} from "../../../../lib/projects/fake-postgrest";

// Real route → lib/projects → owner client → supabase-js; only Clerk's auth()
// and the network (a fake PostgREST that applies RLS) are faked.
vi.mock("server-only", () => ({}));
let signedInAs: string | null = null;
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    isAuthenticated: signedInAs !== null,
    userId: signedInAs,
    getToken: async () => (signedInAs ? tokenFor(signedInAs) : null),
  }),
}));

const { PATCH, DELETE } = await import("./route");

const ALICE = "user_alice";
const BOB = "user_bob";
const UNKNOWN_ID = "00000000-0000-4000-8000-999999999999";
let db: FakePostgrest;
let alices: Project;

function seedProject(owner: string, id: string, name: string): Project {
  const project: Project = {
    id,
    owner_id: owner,
    name,
    public_key: `pk_${id.slice(-6)}`,
    messages_used: 0,
    period_start: "2026-11-01T00:00:00+00:00",
    created_at: "2026-11-03T12:00:00.000Z",
  };
  db.projects.push(project);
  db.configs.add(id);
  return project;
}

beforeEach(() => {
  db = createFakePostgrest();
  vi.stubGlobal("fetch", db.fetch);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubEnv(["SUPABASE", "SECRET", "KEY"].join("_"), SECRET_KEY);
  alices = seedProject(ALICE, "00000000-0000-4000-8000-00000000000a", "Alice's bot");
  seedProject(BOB, "00000000-0000-4000-8000-00000000000b", "Bob's bot");
  signedInAs = ALICE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function patch(id: string, body: unknown, raw = false): Promise<Response> {
  return PATCH(
    new Request(`https://askwell.test/api/projects/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: raw ? String(body) : JSON.stringify(body),
    }),
    ctx(id),
  );
}

function del(id: string): Promise<Response> {
  return DELETE(new Request(`https://askwell.test/api/projects/${id}`, { method: "DELETE" }), ctx(id));
}

const NOT_FOUND = { error: { code: "not_found", message: "Project not found." } };

describe("PATCH /api/projects/:id", () => {
  it("renames the caller's project with the owner client: 200 { project }", async () => {
    const res = await patch(alices.id, { name: "  Renamed  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ project: { ...alices, name: "Renamed" } });
    expect(db.requests.map((r) => `${r.method} ${r.path} as ${r.caller.kind}`)).toEqual([
      "PATCH projects as owner",
    ]);
    expect(db.requests[0]?.body).toEqual({ name: "Renamed" });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns 404 (not 403) for another owner's project, and leaves it unchanged", async () => {
    const bobs = db.projects.find((p) => p.owner_id === BOB);
    const res = await patch(bobs!.id, { name: "Hacked" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(NOT_FOUND);
    expect(bobs?.name).toBe("Bob's bot");
  });

  it("returns the same 404 for an id that doesn't exist", async () => {
    const res = await patch(UNKNOWN_ID, { name: "Renamed" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(NOT_FOUND);
  });

  it("returns 401 without a session", async () => {
    signedInAs = null;
    const res = await patch(alices.id, { name: "Renamed" });
    expect(res.status).toBe(401);
    expect(db.requests).toHaveLength(0);
  });

  it.each([
    ["an id that isn't a uuid", "not-a-uuid", { name: "Renamed" }],
    ["an empty name", alices_id(), { name: "" }],
    ["a 61-character name", alices_id(), { name: "x".repeat(61) }],
    ["another field", alices_id(), { name: "Renamed", owner_id: BOB }],
    ["only another field", alices_id(), { public_key: "pk_mine" }],
  ])("returns 400 validation_failed for %s, without touching the database", async (_label, id, body) => {
    const res = await patch(id, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "validation_failed", message: expect.any(String) } });
    expect(db.requests).toHaveLength(0);
  });

  it("returns 400 for a body that isn't JSON", async () => {
    expect((await patch(alices.id, "nope", true)).status).toBe(400);
  });
});

describe("DELETE /api/projects/:id", () => {
  it("deletes the caller's project with the owner client: 200 { id }, config cascaded", async () => {
    const res = await del(alices.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: alices.id });
    expect(db.projects.map((p) => p.owner_id)).toEqual([BOB]);
    expect(db.configs.has(alices.id)).toBe(false);
    expect(db.requests.map((r) => `${r.method} ${r.path} as ${r.caller.kind}`)).toEqual([
      "DELETE projects as owner",
    ]);
  });

  it("returns 404 (not 403) for another owner's project, and keeps it", async () => {
    const bobs = db.projects.find((p) => p.owner_id === BOB)!;
    const res = await del(bobs.id);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(NOT_FOUND);
    expect(db.projects).toContain(bobs);
  });

  it("returns the same 404 for an id that doesn't exist", async () => {
    expect(await (await del(UNKNOWN_ID)).json()).toEqual(NOT_FOUND);
  });

  it("returns 401 without a session", async () => {
    signedInAs = null;
    expect((await del(alices.id)).status).toBe(401);
    expect(db.requests).toHaveLength(0);
    expect(db.projects).toHaveLength(2);
  });

  it("returns 400 for an id that isn't a uuid", async () => {
    const res = await del("1 or 1=1");
    expect(res.status).toBe(400);
    expect(db.requests).toHaveLength(0);
  });
});

/** Alice's seeded id, for it.each tables built before beforeEach runs. */
function alices_id(): string {
  return "00000000-0000-4000-8000-00000000000a";
}
