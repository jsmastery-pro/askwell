// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import * as schema from "@askwell/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const captureServerEvent = vi.hoisted(() => vi.fn());
vi.mock("../../lib/posthog/server", () => ({ captureServerEvent }));

const { ensureAccount } = await import("./account");

const client = new PGlite({ extensions: { vector } });
const db = drizzle(client, { schema });

beforeAll(async () => {
  const migrationsFolder = new URL("../../../../packages/db/migrations", import.meta.url).pathname;
  await migrate(db, { migrationsFolder });
});

afterAll(async () => {
  await client.close();
});

afterEach(() => {
  captureServerEvent.mockClear();
});

const rowsFor = (clerkUserId: string) =>
  db.select().from(schema.accounts).where(eq(schema.accounts.clerkUserId, clerkUserId));

describe("ensureAccount", () => {
  it("creates one free account for a new user", async () => {
    await ensureAccount("user_new", db);

    const rows = await rowsFor("user_new");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.plan).toBe("free");
  });

  it("does not duplicate the row on a later sign-in", async () => {
    await ensureAccount("user_repeat", db);
    await ensureAccount("user_repeat", db);

    expect(await rowsFor("user_repeat")).toHaveLength(1);
  });

  it("leaves an existing Pro plan untouched", async () => {
    await db.insert(schema.accounts).values({ clerkUserId: "user_pro", plan: "pro" });

    await ensureAccount("user_pro", db);

    const rows = await rowsFor("user_pro");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.plan).toBe("pro");
  });
});

describe("signed_up", () => {
  it("fires once, on the call that creates the account", async () => {
    expect(await ensureAccount("user_signup", db)).toBe(true);
    expect(captureServerEvent).toHaveBeenCalledExactlyOnceWith("user_signup", "signed_up");
  });

  it("doesn't fire on later visits by the same user", async () => {
    await ensureAccount("user_signup_again", db);
    captureServerEvent.mockClear();

    expect(await ensureAccount("user_signup_again", db)).toBe(false);
    expect(captureServerEvent).not.toHaveBeenCalled();
  });
});
