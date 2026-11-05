import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({}) }));
const { planFromItems, proEventUserId } = await import("./plan-sync");

const NOW = Date.parse("2026-11-05T12:00:00Z");
const item = (slug: string, status: string, periodEnd: number | null = NOW + 86_400_000) => ({
  status,
  plan: { slug },
  periodEnd,
});

describe("planFromItems", () => {
  it("is Pro while a pro item is active (including after a cancel, until the period ends)", () => {
    expect(planFromItems([item("pro", "active")], NOW)).toBe("pro");
    expect(planFromItems([item("free_user", "ended"), item("pro", "active")], NOW)).toBe("pro");
  });

  it("a canceled pro item still in its paid period stays Pro; past the period it's Free", () => {
    expect(planFromItems([item("pro", "canceled", NOW + 1000)], NOW)).toBe("pro");
    expect(planFromItems([item("pro", "canceled", NOW - 1000)], NOW)).toBe("free");
    expect(planFromItems([item("pro", "canceled", null)], NOW)).toBe("free");
  });

  it.each(["ended", "expired", "past_due", "abandoned", "incomplete", "upcoming"])("a pro item that is %s is Free", (status) => {
    expect(planFromItems([item("pro", status)], NOW)).toBe("free");
  });

  it("other plans and no items are Free", () => {
    expect(planFromItems([item("free_user", "active")], NOW)).toBe("free");
    expect(planFromItems([], NOW)).toBe("free");
  });
});

describe("proEventUserId", () => {
  const payer = { user_id: "user_1" };
  it("picks the paying user of subscriptionItem.* events on the pro plan", () => {
    for (const type of ["subscriptionItem.active", "subscriptionItem.canceled", "subscriptionItem.ended", "subscriptionItem.pastDue"]) {
      expect(proEventUserId({ type, data: { plan: { slug: "pro" }, payer } })).toBe("user_1");
    }
  });

  it("and of subscription.* events with a pro item", () => {
    expect(
      proEventUserId({ type: "subscription.updated", data: { items: [{ plan: { slug: "free_user" } }, { plan: { slug: "pro" } }], payer } }),
    ).toBe("user_1");
  });

  it("ignores other plans, other events, and organization payers", () => {
    expect(proEventUserId({ type: "subscriptionItem.active", data: { plan: { slug: "free_user" }, payer } })).toBeNull();
    expect(proEventUserId({ type: "subscription.created", data: { items: [{ plan: { slug: "free_user" } }], payer } })).toBeNull();
    expect(proEventUserId({ type: "user.created", data: { plan: { slug: "pro" }, payer } })).toBeNull();
    expect(proEventUserId({ type: "paymentAttempt.updated", data: { plan: { slug: "pro" }, payer } })).toBeNull();
    expect(proEventUserId({ type: "subscriptionItem.active", data: { plan: { slug: "pro" }, payer: { user_id: null } } })).toBeNull();
    expect(proEventUserId({ type: "subscriptionItem.active", data: { plan: { slug: "pro" } } })).toBeNull();
  });
});
