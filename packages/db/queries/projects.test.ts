import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { getOwnedProject } from "./projects";

// In-memory Postgres running the real migrations.
const client = new PGlite({ extensions: { vector } });
const db = drizzle(client, { schema });

let projectId: string;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  await db.insert(schema.accounts).values([{ clerkUserId: "user_owner" }, { clerkUserId: "user_other" }]);
  const [project] = await db
    .insert(schema.projects)
    .values({ ownerId: "user_owner", name: "Docs bot", publicKey: "pk_test123" })
    .returning();
  projectId = project!.id;
});

afterAll(async () => {
  await client.close();
});

describe("getOwnedProject", () => {
  it("returns the project to its owner", async () => {
    const project = await getOwnedProject(projectId, "user_owner", db);
    expect(project?.id).toBe(projectId);
    expect(project?.name).toBe("Docs bot");
  });

  it("returns null for another user", async () => {
    expect(await getOwnedProject(projectId, "user_other", db)).toBeNull();
  });

  it("returns null for a project that doesn't exist", async () => {
    expect(await getOwnedProject("00000000-0000-4000-8000-000000000000", "user_owner", db)).toBeNull();
  });

  it("returns null, not a throw, for a malformed id", async () => {
    expect(await getOwnedProject("not-a-uuid", "user_owner", db)).toBeNull();
  });
});
