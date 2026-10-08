// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import * as schema from "@askwell/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureAccount } from "./account";

const client = new PGlite({ extensions: { vector } });
const db = drizzle(client, { schema });

beforeAll(async () => {
  const migrationsFolder = new URL("../../../../packages/db/migrations", import.meta.url).pathname;
  await migrate(db, { migrationsFolder });
});

afterAll(async () => {
  await client.close();
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
