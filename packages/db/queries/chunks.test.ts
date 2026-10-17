import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { searchChunks } from "./chunks";

// In-memory Postgres running the real migrations.
const client = new PGlite({ extensions: { vector } });
const db = drizzle(client, { schema });

// A unit vector at `angleDeg` from the first axis. Cosine distance only depends on
// direction, so this gives chunks a known, ordered distance from a query at angle 0.
function vectorAt(angleDeg: number): number[] {
  const angle = (angleDeg * Math.PI) / 180;
  const v = new Array(1536).fill(0);
  v[0] = Math.cos(angle);
  v[1] = Math.sin(angle);
  return v;
}

const QUERY = vectorAt(0);

let projectId: string;
let otherProjectId: string;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  await db.insert(schema.accounts).values([{ clerkUserId: "user_owner" }]);

  const [project] = await db
    .insert(schema.projects)
    .values({ ownerId: "user_owner", name: "Docs bot", publicKey: "pk_test_chunks" })
    .returning();
  projectId = project!.id;

  const [otherProject] = await db
    .insert(schema.projects)
    .values({ ownerId: "user_owner", name: "Other bot", publicKey: "pk_test_other_chunks" })
    .returning();
  otherProjectId = otherProject!.id;

  const [source] = await db
    .insert(schema.knowledgeSources)
    .values({ projectId, title: "Docs", type: "text", status: "ready" })
    .returning();
  const [otherSource] = await db
    .insert(schema.knowledgeSources)
    .values({ projectId: otherProjectId, title: "Other docs", type: "text", status: "ready" })
    .returning();

  await db.insert(schema.knowledgeChunks).values([
    { projectId, sourceId: source!.id, content: "far", embedding: vectorAt(80) },
    { projectId, sourceId: source!.id, content: "near", embedding: vectorAt(5) },
    { projectId, sourceId: source!.id, content: "mid", embedding: vectorAt(30) },
    // Closer to the query than every in-project chunk, but belongs to another project.
    {
      projectId: otherProjectId,
      sourceId: otherSource!.id,
      content: "foreign-closest",
      embedding: vectorAt(1),
    },
  ]);
});

afterAll(async () => {
  await client.close();
});

describe("searchChunks", () => {
  it("ranks the nearest chunk first", async () => {
    const results = await searchChunks(projectId, QUERY, 5, db);
    expect(results.map((r) => r.content)).toEqual(["near", "mid", "far"]);
  });

  it("never returns another project's chunks, even one closer than all of this project's", async () => {
    const results = await searchChunks(projectId, QUERY, 5, db);
    expect(results.map((r) => r.content)).not.toContain("foreign-closest");
  });

  it("caps results at k", async () => {
    const results = await searchChunks(projectId, QUERY, 2, db);
    expect(results).toHaveLength(2);
  });

  it("orders by distance, ascending", async () => {
    const results = await searchChunks(projectId, QUERY, 5, db);
    const distances = results.map((r) => r.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });
});
