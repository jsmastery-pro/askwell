import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "../client";
import * as schema from "../schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export type ProjectRow = typeof schema.projects.$inferSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The project, only if `ownerId` owns it. `null` for "not found" and "not owned" alike,
 * so callers can't leak which projects exist. `ownerId` is the Clerk user ID.
 */
export async function getOwnedProject(
  projectId: string,
  ownerId: string,
  database: Database = defaultDb,
): Promise<ProjectRow | null> {
  // A malformed id would make Postgres throw on the uuid cast.
  if (!UUID_RE.test(projectId)) return null;

  const [project] = await database
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.ownerId, ownerId)))
    .limit(1);

  return project ?? null;
}
