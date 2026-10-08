// Test-only: in-memory Postgres with the real migrations, shared by the widget config and rate limit tests.
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import * as schema from "@askwell/db";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";

const migrationsFolder = fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url));

export async function createTestDb() {
  const client = new PGlite({ extensions: { vector } });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db, close: () => client.close() };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];

type Seed = {
  plan: "free" | "pro";
  publicKey: string;
  config?: Partial<typeof schema.widgetConfigs.$inferInsert>;
};

export async function seedProject(db: TestDb, { plan, publicKey, config }: Seed) {
  const ownerId = `user_${publicKey}`;
  await db.insert(schema.accounts).values({ clerkUserId: ownerId, plan });
  const [project] = await db
    .insert(schema.projects)
    .values({ ownerId, name: `Project ${publicKey}`, publicKey })
    .returning();
  if (config) {
    await db.insert(schema.widgetConfigs).values({ projectId: project!.id, ...config });
  }
  return project!;
}
