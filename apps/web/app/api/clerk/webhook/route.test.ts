// @vitest-environment node
import { accounts } from "@askwell/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../../lib/widget-config/test-db";

// Standard Webhooks signing, matching the `standardwebhooks` package @clerk/backend verifies
// against: HMAC-SHA256("<id>.<timestamp>.<body>") with the base64-decoded whsec_ secret.
const SIGNING_SECRET = `whsec_${Buffer.from("test-signing-secret-bytes").toString("base64")}`;

function sign(id: string, timestamp: number, body: string): string {
  const key = Buffer.from(SIGNING_SECRET.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return `v1,${signature}`;
}

// verifyWebhook only reads .headers and .text(), both on the plain Request a real
// NextRequest also provides; the cast avoids constructing a full NextRequest in tests.
function signedRequest(payload: unknown, { badSignature = false } = {}): NextRequest {
  const body = JSON.stringify(payload);
  const id = "msg_test";
  const timestamp = Math.floor(Date.now() / 1000);
  return new Request("https://app.test/api/clerk/webhook", {
    method: "POST",
    headers: {
      "svix-id": id,
      "svix-timestamp": String(timestamp),
      "svix-signature": badSignature ? "v1,not-the-right-signature" : sign(id, timestamp, body),
      "Content-Type": "application/json",
    },
    body,
  }) as unknown as NextRequest;
}

function subscriptionItemEvent(type: string, userId: string, planSlug = "pro") {
  return {
    type,
    data: {
      object: "subscription_item",
      status: type.split(".")[1],
      payer: { object: "billing_payer", id: "payer_1", user_id: userId },
      plan: { id: "plan_1", slug: planSlug, name: "Pro" },
    },
    event_attributes: { http_request: { client_ip: "0.0.0.0", user_agent: "vitest" } },
    timestamp: Math.floor(Date.now() / 1000),
    instance_id: "ins_test",
  };
}

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@askwell/db/client", () => ({
  get db() {
    return state.db;
  },
}));

const captureServerEvent = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/posthog/server", () => ({ captureServerEvent }));

const { POST } = await import("./route");

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
});

afterAll(() => close());

beforeEach(() => {
  vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", SIGNING_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  captureServerEvent.mockClear();
});

async function seedAccount(clerkUserId: string, plan: "free" | "pro") {
  await db.insert(accounts).values({ clerkUserId, plan });
}

async function planOf(clerkUserId: string): Promise<string | undefined> {
  const [row] = await db.select().from(accounts).where(eq(accounts.clerkUserId, clerkUserId));
  return row?.plan;
}

describe("POST /api/clerk/webhook", () => {
  it("rejects a request with no signature headers", async () => {
    const res = await POST(
      new Request("https://app.test/api/clerk/webhook", {
        method: "POST",
        body: "{}",
        headers: { "Content-Type": "application/json" },
      }) as unknown as NextRequest,
    );
    expect(res.status).toBe(400);
  });

  it("rejects a bad signature, without touching the account", async () => {
    await seedAccount("user_badsig", "free");
    const res = await POST(signedRequest(subscriptionItemEvent("subscriptionItem.active", "user_badsig"), { badSignature: true }));
    expect(res.status).toBe(400);
    expect(await planOf("user_badsig")).toBe("free");
  });

  it("sets the account to pro on subscriptionItem.active", async () => {
    await seedAccount("user_active", "free");
    const res = await POST(signedRequest(subscriptionItemEvent("subscriptionItem.active", "user_active")));
    expect(res.status).toBe(200);
    expect(await planOf("user_active")).toBe("pro");
  });

  it("does not downgrade on subscriptionItem.canceled (Pro access continues until ended)", async () => {
    await seedAccount("user_canceled", "pro");
    const res = await POST(signedRequest(subscriptionItemEvent("subscriptionItem.canceled", "user_canceled")));
    expect(res.status).toBe(200);
    expect(await planOf("user_canceled")).toBe("pro");
  });

  it("sets the account to free on subscriptionItem.ended", async () => {
    await seedAccount("user_ended", "pro");
    const res = await POST(signedRequest(subscriptionItemEvent("subscriptionItem.ended", "user_ended")));
    expect(res.status).toBe(200);
    expect(await planOf("user_ended")).toBe("free");
  });

  it("ignores a non-Pro plan's active event", async () => {
    await seedAccount("user_other_active", "free");
    const res = await POST(signedRequest(subscriptionItemEvent("subscriptionItem.active", "user_other_active", "starter")));
    expect(res.status).toBe(200);
    expect(await planOf("user_other_active")).toBe("free");
  });

  it("ignores a non-Pro plan's ended event", async () => {
    await seedAccount("user_other_ended", "pro");
    const res = await POST(signedRequest(subscriptionItemEvent("subscriptionItem.ended", "user_other_ended", "starter")));
    expect(res.status).toBe(200);
    expect(await planOf("user_other_ended")).toBe("pro");
  });

  it("is a no-op for an unrelated event", async () => {
    await seedAccount("user_noop", "free");
    const res = await POST(signedRequest(subscriptionItemEvent("subscriptionItem.upcoming", "user_noop")));
    expect(res.status).toBe(200);
    expect(await planOf("user_noop")).toBe("free");
  });

  it("doesn't throw when the account doesn't exist (unknown user)", async () => {
    const res = await POST(signedRequest(subscriptionItemEvent("subscriptionItem.active", "user_unknown")));
    expect(res.status).toBe(200);
  });
});

describe("upgraded", () => {
  it("fires when a Pro subscription becomes active", async () => {
    await seedAccount("user_upgraded", "free");
    await POST(signedRequest(subscriptionItemEvent("subscriptionItem.active", "user_upgraded")));
    expect(captureServerEvent).toHaveBeenCalledExactlyOnceWith("user_upgraded", "upgraded", { plan: "pro" });
  });

  it.each([
    ["a downgrade", "subscriptionItem.ended", "pro"],
    ["a non-Pro plan", "subscriptionItem.active", "starter"],
  ])("doesn't fire for %s", async (_label, type, planSlug) => {
    await seedAccount(`user_not_upgraded_${planSlug}`, "pro");
    await POST(signedRequest(subscriptionItemEvent(type, `user_not_upgraded_${planSlug}`, planSlug)));
    expect(captureServerEvent).not.toHaveBeenCalled();
  });

  it("doesn't fire for a request with a bad signature", async () => {
    await seedAccount("user_upgraded_badsig", "free");
    await POST(signedRequest(subscriptionItemEvent("subscriptionItem.active", "user_upgraded_badsig"), { badSignature: true }));
    expect(captureServerEvent).not.toHaveBeenCalled();
  });
});
