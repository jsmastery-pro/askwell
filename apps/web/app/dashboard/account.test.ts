// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { argsOf, callsTo, fakeSupabase } from "../../lib/supabase/fake";

// ensureAccount writes with a fake service client. That owners can't insert or change their own
// account row is tested against the real migrations on pglite (packages/db).
vi.mock("server-only", () => ({}));
vi.mock("../../lib/supabase/service", () => ({
  createServiceClient: () => {
    throw new Error("real service client used in a test");
  },
}));

const captureServerEvent = vi.hoisted(() => vi.fn());
vi.mock("../../lib/posthog/server", () => ({ captureServerEvent }));

const { ensureAccount } = await import("./account");

afterEach(() => {
  captureServerEvent.mockClear();
});

/** A service client whose upsert returns `inserted` rows: one when it created the account, none when it already existed. */
const serviceReturning = (inserted: { clerk_user_id: string }[]) => fakeSupabase({ from: { accounts: { data: inserted } } });

describe("ensureAccount", () => {
  it("inserts a free account, leaving an existing row (and its plan) untouched", async () => {
    const service = serviceReturning([{ clerk_user_id: "user_new" }]);

    await ensureAccount("user_new", service);

    const [call] = callsTo(service, "accounts");
    expect(argsOf(call, "upsert")).toEqual([
      { clerk_user_id: "user_new", plan: "free" },
      { onConflict: "clerk_user_id", ignoreDuplicates: true },
    ]);
    expect(argsOf(call, "select")).toEqual(["clerk_user_id"]);
  });

  it("is true only when this call created the row", async () => {
    expect(await ensureAccount("user_new", serviceReturning([{ clerk_user_id: "user_new" }]))).toBe(true);
    expect(await ensureAccount("user_repeat", serviceReturning([]))).toBe(false);
  });

  it("throws a database error instead of reading it as an existing account", async () => {
    const service = fakeSupabase({ from: { accounts: { error: { code: "42501", message: "permission denied" } } } });

    await expect(ensureAccount("user_new", service)).rejects.toMatchObject({ code: "42501" });
    expect(captureServerEvent).not.toHaveBeenCalled();
  });
});

describe("signed_up", () => {
  it("fires once, on the call that creates the account", async () => {
    await ensureAccount("user_signup", serviceReturning([{ clerk_user_id: "user_signup" }]));
    expect(captureServerEvent).toHaveBeenCalledExactlyOnceWith("user_signup", "signed_up");
  });

  it("doesn't fire on later visits by the same user", async () => {
    await ensureAccount("user_signup_again", serviceReturning([]));
    expect(captureServerEvent).not.toHaveBeenCalled();
  });
});
