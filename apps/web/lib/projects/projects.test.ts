import { publicKeySchema } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakePostgrest,
  PUBLISHABLE_KEY,
  SECRET_KEY,
  SUPABASE_URL,
  tokenFor,
  type FakePostgrest,
} from "./fake-postgrest";

vi.mock("server-only", () => ({}));
let signedInAs: string | null = "user_alice";
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    isAuthenticated: signedInAs !== null,
    userId: signedInAs,
    getToken: async () => (signedInAs ? tokenFor(signedInAs) : null),
  }),
}));

const { generatePublicKey, getOwnedProject, createProject, PlanLimitError, ProjectError } = await import(
  "./projects"
);

let db: FakePostgrest;

beforeEach(() => {
  db = createFakePostgrest();
  vi.stubGlobal("fetch", db.fetch);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubEnv(["SUPABASE", "SECRET", "KEY"].join("_"), SECRET_KEY);
  signedInAs = "user_alice";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("generatePublicKey", () => {
  it("is pk_ + 32 base64url characters (24 random bytes) and passes publicKeySchema", () => {
    for (let i = 0; i < 50; i++) {
      const key = generatePublicKey();
      expect(key).toMatch(/^pk_[A-Za-z0-9_-]{32}$/);
      expect(publicKeySchema.safeParse(key).success).toBe(true);
    }
  });

  it("doesn't repeat", () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generatePublicKey()));
    expect(keys.size).toBe(1000);
  });
});

describe("getOwnedProject", () => {
  it("returns the caller's project via the owner client, and null for anyone else's", async () => {
    db.accounts.set("user_alice", "free");
    db.accounts.set("user_bob", "free");
    const alices = await createProject("user_alice", "Alice's", "free");
    const bobs = await createProject("user_bob", "Bob's", "free");

    db.requests.length = 0;
    expect(await getOwnedProject(alices.id)).toEqual(alices);
    expect(await getOwnedProject(bobs.id)).toBeNull();
    expect(db.requests.every((r) => r.caller.kind === "owner")).toBe(true);
  });
});

describe("createProject", () => {
  it("throws PlanLimitError with the plan and limit at the limit", async () => {
    db.accounts.set("user_alice", "free");
    await createProject("user_alice", "First", "free");
    const error = await createProject("user_alice", "Second", "free").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanLimitError);
    expect(error).toMatchObject({ plan: "free", limit: 1 });
  });

  it("gives up after 3 key collisions", async () => {
    db.accounts.set("user_alice", "pro");
    const realFetch = db.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/rpc/create_project")) db.takenKeys.add(JSON.parse(String(init?.body)).p_public_key);
      return realFetch(input, init);
    });
    await expect(createProject("user_alice", "Unlucky", "pro")).rejects.toBeInstanceOf(ProjectError);
    expect(db.requests.filter((r) => r.path === "rpc/create_project")).toHaveLength(3);
  });

  it("throws ProjectError (not a plan error) when the account row is missing", async () => {
    await expect(createProject("user_nobody", "Ghost", "free")).rejects.toBeInstanceOf(ProjectError);
  });
});
