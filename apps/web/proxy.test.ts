import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Replace clerkMiddleware with a pass-through so the handler and its options
// can be tested without a Clerk instance.
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown, options: unknown) =>
    Object.assign(handler as object, { options }),
}));

type Handler = ((auth: () => Promise<unknown>, req: NextRequest) => Promise<Response | void>) & {
  options: { signInUrl: string; signUpUrl: string };
};

const { default: proxy, config } = await import("./proxy");
const handler = proxy as unknown as Handler;

const redirectToSignIn = vi.fn(() => new Response(null, { status: 307 }));
const signedIn = async () => ({ isAuthenticated: true, redirectToSignIn });
const signedOut = async () => ({ isAuthenticated: false, redirectToSignIn });
const request = (path: string) => new NextRequest(new URL(path, "https://askwell.test"));

beforeEach(() => redirectToSignIn.mockClear());

describe("proxy", () => {
  it("uses our sign-in and sign-up pages", () => {
    expect(handler.options).toEqual({ signInUrl: "/sign-in", signUpUrl: "/sign-up" });
  });

  it("redirects a signed-out owner page request to sign-in", async () => {
    const res = await handler(signedOut, request("/dashboard"));
    expect(redirectToSignIn).toHaveBeenCalledOnce();
    expect(res?.status).toBe(307);
  });

  it("returns 401 with the §8 error shape for a signed-out owner API request", async () => {
    const res = await handler(signedOut, request("/api/projects"));
    expect(res?.status).toBe(401);
    expect(await res?.json()).toMatchObject({ error: { code: "unauthorized" } });
    expect(redirectToSignIn).not.toHaveBeenCalled();
  });

  it("lets signed-in owners through", async () => {
    expect(await handler(signedIn, request("/dashboard"))).toBeUndefined();
    expect(await handler(signedIn, request("/api/projects"))).toBeUndefined();
  });

  it("never reads auth on public routes", async () => {
    const auth = vi.fn(signedOut);
    for (const path of ["/", "/embed", "/api/widget/config", "/api/clerk/webhook"]) {
      expect(await handler(auth, request(path))).toBeUndefined();
    }
    expect(auth).not.toHaveBeenCalled();
  });
});

describe("proxy matcher", () => {
  // Next matches each entry against the whole pathname.
  const runsOn = (path: string) =>
    config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(path));

  it.each(["/", "/dashboard", "/dashboard/x", "/sign-in", "/embed", "/api/projects", "/api/widget/config"])(
    "runs on %s",
    (path) => expect(runsOn(path)).toBe(true),
  );

  it.each(["/_next/static/chunk.js", "/favicon.ico", "/logo.svg"])("skips %s", (path) =>
    expect(runsOn(path)).toBe(false),
  );
});
