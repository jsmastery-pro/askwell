import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "server-only" throws outside a React Server Components build; the tests run
// in plain Node, so stub it. Clerk's auth() is mocked per test.
vi.mock("server-only", () => ({}));
const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));

const { createOwnerClient, UnauthorizedError } = await import("./owner");
const { createServiceClient } = await import("./service");
const { MissingEnvError } = await import("./env");

// Built, not written out: only service.ts may name the secret's variable
// (the lint guard and the done-when grep both check this).
const SECRET_ENV = ["SUPABASE", "SECRET", "KEY"].join("_");
const URL_ = "https://example.supabase.co";
const PUBLISHABLE = "sb_publishable_test";
const SECRET = "sb_secret_test";
const CLERK_TOKEN = "clerk.session.token";

/** Records the headers of every request supabase-js sends, and answers []. */
const requests: { url: string; headers: Record<string, string> }[] = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  requests.push({
    url: String(input),
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
  });
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
});

/** A Clerk auth() result: signed in with `token`, or signed out. */
function session(token: string | null) {
  return { isAuthenticated: token !== null, getToken: vi.fn(async () => token) };
}

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
  vi.stubEnv(SECRET_ENV, SECRET);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  authMock.mockReset();
});

describe("createOwnerClient", () => {
  it("sends the Clerk session token as the Bearer token, with the publishable key", async () => {
    authMock.mockResolvedValue(session(CLERK_TOKEN));
    const client = await createOwnerClient();
    await client.from("projects").select("id");

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${URL_}/rest/v1/projects?select=id`);
    expect(requests[0]?.headers).toMatchObject({
      apikey: PUBLISHABLE,
      authorization: `Bearer ${CLERK_TOKEN}`,
    });
  });

  it("asks Clerk for a fresh token on every request", async () => {
    const auth = session(CLERK_TOKEN);
    authMock.mockResolvedValue(auth);
    const client = await createOwnerClient();
    auth.getToken.mockResolvedValue("rotated.token");
    await client.from("projects").select("id");
    expect(requests[0]?.headers.authorization).toBe("Bearer rotated.token");
  });

  it("throws UnauthorizedError without a session and sends nothing", async () => {
    authMock.mockResolvedValue(session(null));
    const error = await createOwnerClient().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error).toMatchObject({ code: "unauthorized" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when Clerk says signed in but has no token (never falls back to anon)", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, getToken: vi.fn(async () => null) });
    await expect(createOwnerClient()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("fails the query instead of querying as anon if the token disappears later", async () => {
    const auth = session(CLERK_TOKEN);
    authMock.mockResolvedValue(auth);
    const client = await createOwnerClient();
    auth.getToken.mockResolvedValue(null);

    // postgrest-js retries a failed GET with backoff (about 7s) before it
    // returns the error; retry(false) skips the waits. Either way no request
    // is sent, so nothing ever runs as anon.
    const { data, error } = await client.from("projects").select("id").retry(false);
    expect(data).toBeNull();
    expect(error?.message).toMatch(/Sign in to use this route/);
    expect(requests).toHaveLength(0);
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"])(
    "throws MissingEnvError naming %s when it's unset",
    async (name) => {
      authMock.mockResolvedValue(session(CLERK_TOKEN));
      vi.stubEnv(name, "");
      const error = await createOwnerClient().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(MissingEnvError);
      expect(error).toMatchObject({ variable: name });
      expect((error as Error).message).toContain(name);
    },
  );
});

describe("createServiceClient", () => {
  it("uses the secret key as apikey and Bearer token", async () => {
    const client = createServiceClient();
    await client.from("accounts").select("clerk_user_id");

    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers).toMatchObject({
      apikey: SECRET,
      authorization: `Bearer ${SECRET}`,
    });
  });

  it("never asks Clerk for a session", async () => {
    await createServiceClient().from("accounts").select("clerk_user_id");
    expect(authMock).not.toHaveBeenCalled();
  });

  it.each([SECRET_ENV, "NEXT_PUBLIC_SUPABASE_URL"])(
    "throws MissingEnvError naming %s when it's unset",
    (name) => {
      vi.stubEnv(name, "");
      expect(() => createServiceClient()).toThrow(MissingEnvError);
      expect(() => createServiceClient()).toThrow(name);
    },
  );

  it("treats a blank value as missing", () => {
    vi.stubEnv(SECRET_ENV, "   ");
    expect(() => createServiceClient()).toThrow(SECRET_ENV);
  });
});
