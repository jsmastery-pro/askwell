// @vitest-environment node
import { PLAN_LIMITS } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { listProjectUsage } from "../../../lib/data/usage";
import { argsOf, callsTo, fakeSupabase } from "../../../lib/supabase/fake";

// The Billing page's usage list, read with a fake owner client. That RLS returns only the
// signed-in owner's projects is tested against the real migrations on pglite (packages/db).
vi.mock("server-only", () => ({}));
vi.mock("../../../lib/supabase/owner", () => ({
  createOwnerClient: () => {
    throw new Error("real owner client used in a test");
  },
}));

describe("listProjectUsage", () => {
  it("lists the owner's projects oldest first, with real counts and reset dates", async () => {
    const client = fakeSupabase({
      from: {
        projects: {
          data: [
            { id: "p1", name: "First", messages_used: 1700, period_start: "2026-01-31T00:00:00+00:00", account: { plan: "pro" } },
            { id: "p2", name: "Second", messages_used: 0, period_start: "2026-03-15T12:30:00+00:00", account: { plan: "pro" } },
          ],
        },
      },
    });

    const rows = await listProjectUsage(client);

    expect(rows.map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(rows[0]).toEqual({
      id: "p1",
      name: "First",
      plan: "pro",
      messagesUsed: 1700,
      messagesLimit: PLAN_LIMITS.pro.messagesPerMonth,
      periodStart: "2026-01-31T00:00:00.000Z",
      resetsAt: "2026-02-28T00:00:00.000Z",
    });
    expect(argsOf(callsTo(client, "projects")[0], "order")).toEqual(["created_at", { ascending: true }]);
  });

  it("returns nothing for an owner with no projects", async () => {
    expect(await listProjectUsage(fakeSupabase({ from: { projects: { data: [] } } }))).toEqual([]);
  });

  it("throws a query error instead of reading it as no projects", async () => {
    const client = fakeSupabase({ from: { projects: { error: { code: "42501", message: "denied" } } } });
    await expect(listProjectUsage(client)).rejects.toMatchObject({ code: "42501" });
  });
});
