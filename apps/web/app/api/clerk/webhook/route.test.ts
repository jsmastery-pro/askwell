import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAccounts, PUBLISHABLE_KEY, SECRET_KEY, SUPABASE_URL } from "../../../../lib/billing/fake-accounts";

// The real route → lib/billing → service client → supabase-js against an
// in-memory accounts table. Faked: Clerk's signature check, Clerk's Backend
// API (the user's current subscription) and PostHog.
vi.mock("server-only", () => ({}));
const verify = vi.fn();
vi.mock("@clerk/nextjs/webhooks", () => ({ verifyWebhook: (req: unknown) => verify(req) }));
const getSubscription = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ billing: { getUserBillingSubscription: (id: string) => getSubscription(id) } }),
}));
const captured = vi.fn();
vi.mock("../../../../lib/analytics/server", () => ({ captureServerEvent: (e: unknown) => captured(e) }));

const { POST } = await import("./route");

const USER = "user_pro_buyer";
const DAY = 86_400_000;
let db: ReturnType<typeof createFakeAccounts>;

const event = (type: string, data: Record<string, unknown>) => ({ type, object: "event", data });
const itemEvent = (type: string, slug = "pro", user_id: string | null = USER) =>
  event(type, { id: "csi_1", object: "commerce_subscription_item", status: "active", plan: { slug }, payer: { user_id } });
/** What Clerk's Backend API answers for the user's subscription right now. */
const subscription = (...items: { slug: string; status: string; periodEnd?: number | null }[]) => ({
  id: "csub_1",
  subscriptionItems: items.map((i) => ({ status: i.status, plan: { slug: i.slug }, periodEnd: i.periodEnd ?? Date.now() + 10 * DAY })),
});
const notFound = Object.assign(new Error("Not Found"), { status: 404 });

/** A delivery whose signature verifies to `evt`. */
async function deliver(evt: unknown) {
  verify.mockResolvedValueOnce(evt);
  const res = await POST(new Request("https://askwell.test/api/clerk/webhook", { method: "POST", body: JSON.stringify(evt) }) as never);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  db = createFakeAccounts();
  vi.stubGlobal("fetch", db.fetch);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubEnv(["SUPABASE", "SECRET", "KEY"].join("_"), SECRET_KEY);
  verify.mockReset();
  getSubscription.mockReset();
  captured.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/clerk/webhook", () => {
  it.each([
    ["unsigned", new Error("Missing required Svix headers")],
    ["badly signed", new Error("No matching signature found")],
  ])("%s → 400 invalid_signature, with no Clerk call and no DB access", async (_label, failure) => {
    verify.mockRejectedValueOnce(failure);
    const res = await POST(new Request("https://askwell.test/api/clerk/webhook", { method: "POST", body: "{}" }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "invalid_signature", message: "Invalid webhook signature." } });
    expect(db.calls).toHaveLength(0);
    expect(getSubscription).not.toHaveBeenCalled();
    expect(captured).not.toHaveBeenCalled();
  });

  it("verifies with the request itself (verifyWebhook reads CLERK_WEBHOOK_SIGNING_SECRET)", async () => {
    getSubscription.mockResolvedValue(subscription({ slug: "pro", status: "active" }));
    await deliver(itemEvent("subscriptionItem.active"));
    expect(verify.mock.calls[0]?.[0]).toBeInstanceOf(Request);
  });

  it("pro active → plan pro, reading the plan from Clerk's current subscription; a missing row is created", async () => {
    getSubscription.mockResolvedValue(subscription({ slug: "free_user", status: "ended" }, { slug: "pro", status: "active" }));
    expect(await deliver(itemEvent("subscriptionItem.active"))).toEqual({ status: 200, body: { received: true } });
    expect(getSubscription).toHaveBeenCalledWith(USER);
    expect(db.accounts.get(USER)).toBe("pro");
    expect(db.calls.every((c) => c.service)).toBe(true);
  });

  it("free → pro sends `upgraded` once; repeats of the same event don't", async () => {
    db.accounts.set(USER, "free");
    getSubscription.mockResolvedValue(subscription({ slug: "pro", status: "active" }));
    await deliver(itemEvent("subscriptionItem.active"));
    await deliver(itemEvent("subscriptionItem.active"));
    await deliver(event("subscription.active", { id: "csub_1", items: [{ plan: { slug: "pro" } }], payer: { user_id: USER } }));
    expect(captured).toHaveBeenCalledOnce();
    expect(captured).toHaveBeenCalledWith({ distinctId: USER, event: "upgraded", properties: { plan: "pro", previous_plan: "free" } });
  });

  it("two deliveries at once still send `upgraded` once", async () => {
    db.accounts.set(USER, "free");
    getSubscription.mockResolvedValue(subscription({ slug: "pro", status: "active" }));
    await Promise.all([deliver(itemEvent("subscriptionItem.active")), deliver(itemEvent("subscriptionItem.active"))]);
    expect(db.accounts.get(USER)).toBe("pro");
    expect(captured).toHaveBeenCalledOnce();
  });

  it("a new account created straight on Pro counts as an upgrade from Free", async () => {
    getSubscription.mockResolvedValue(subscription({ slug: "pro", status: "active" }));
    await deliver(itemEvent("subscriptionItem.active"));
    expect(captured).toHaveBeenCalledOnce();
  });

  it("ended → free, with no `upgraded`", async () => {
    db.accounts.set(USER, "pro");
    getSubscription.mockResolvedValue(subscription({ slug: "pro", status: "ended" }, { slug: "free_user", status: "active" }));
    expect((await deliver(itemEvent("subscriptionItem.ended"))).status).toBe(200);
    expect(db.accounts.get(USER)).toBe("free");
    expect(captured).not.toHaveBeenCalled();
  });

  it("a cancel keeps Pro while the canceled item is still active (paid period not over)", async () => {
    db.accounts.set(USER, "pro");
    getSubscription.mockResolvedValue(subscription({ slug: "pro", status: "active", periodEnd: Date.now() + 20 * DAY }));
    await deliver(itemEvent("subscriptionItem.canceled"));
    expect(db.accounts.get(USER)).toBe("pro");
    expect(captured).not.toHaveBeenCalled();
  });

  it("an older event arriving late doesn't change the plan: Clerk's current subscription wins", async () => {
    db.accounts.set(USER, "pro");
    // The user's Pro ended; the earlier "active" event is delivered after that.
    getSubscription.mockResolvedValue(subscription({ slug: "pro", status: "ended" }));
    await deliver(itemEvent("subscriptionItem.ended"));
    expect(db.accounts.get(USER)).toBe("free");
    await deliver(itemEvent("subscriptionItem.active"));
    expect(db.accounts.get(USER)).toBe("free");
    expect(captured).not.toHaveBeenCalled();
  });

  it("a subscription.* event with a pro item syncs too", async () => {
    getSubscription.mockResolvedValue(subscription({ slug: "pro", status: "active" }));
    const evt = event("subscription.updated", { id: "csub_1", items: [{ plan: { slug: "free_user" } }, { plan: { slug: "pro" } }], payer: { user_id: USER } });
    await deliver(evt);
    expect(db.accounts.get(USER)).toBe("pro");
  });

  it.each([
    ["another plan", itemEvent("subscriptionItem.active", "free_user")],
    ["a subscription without a pro item", event("subscription.created", { items: [{ plan: { slug: "free_user" } }], payer: { user_id: USER } })],
    ["a non-billing event", event("user.created", { id: USER })],
    ["an organization payer", itemEvent("subscriptionItem.active", "pro", null)],
    ["an unexpected shape", { type: "subscriptionItem.active" }],
  ])("ignores %s with 200: no Clerk call, no DB access", async (_label, evt) => {
    expect(await deliver(evt)).toEqual({ status: 200, body: { received: true } });
    expect(getSubscription).not.toHaveBeenCalled();
    expect(db.calls).toHaveLength(0);
  });

  it("a user with no subscription in Clerk (404) is Free", async () => {
    db.accounts.set(USER, "pro");
    getSubscription.mockRejectedValue(notFound);
    expect((await deliver(itemEvent("subscriptionItem.ended"))).status).toBe(200);
    expect(db.accounts.get(USER)).toBe("free");
  });

  it("a Clerk API failure → 500 (Clerk retries) and nothing is written", async () => {
    db.accounts.set(USER, "free");
    getSubscription.mockRejectedValue(Object.assign(new Error("boom"), { status: 503 }));
    const res = await deliver(itemEvent("subscriptionItem.active"));
    expect(res).toEqual({ status: 500, body: { error: { code: "internal", message: "Something went wrong. Try again." } } });
    expect(db.calls).toHaveLength(0);
    expect(db.accounts.get(USER)).toBe("free");
  });

  it("a database failure → 500 (Clerk retries), with no `upgraded`", async () => {
    getSubscription.mockResolvedValue(subscription({ slug: "pro", status: "active" }));
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "down" }), { status: 503 }));
    expect((await deliver(itemEvent("subscriptionItem.active"))).status).toBe(500);
    expect(captured).not.toHaveBeenCalled();
  });
});
