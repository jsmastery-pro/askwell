import { accounts, projects, widgetConfigs } from "@askwell/db";
import { db as defaultDb } from "@askwell/db/client";
import { getOwnedProject, type Database, type ProjectRow } from "@askwell/db/queries";
import { PLAN_LIMITS, type Project } from "@askwell/shared";
import { and, asc, count, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { ensureAccount } from "../../app/dashboard/account";
import { captureServerEvent } from "../posthog/server";

/** `pk_` + 24 random bytes, base64url (URL-safe, 32 chars). */
export function generatePublicKey(): string {
  return `pk_${randomBytes(24).toString("base64url")}`;
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    publicKey: row.publicKey,
    messagesUsed: row.messagesUsed,
    periodStart: row.periodStart.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listProjects(ownerId: string, database: Database = defaultDb): Promise<ProjectRow[]> {
  return database.select().from(projects).where(eq(projects.ownerId, ownerId)).orderBy(asc(projects.createdAt));
}

export type CreateProjectResult =
  | { ok: true; project: ProjectRow }
  | { ok: false; reason: "plan_limit"; limit: number };

/**
 * Creates a project and its default widget config in one transaction, if the owner's plan allows.
 * The plan is read from the database. The account row is locked so two concurrent creates
 * can't both pass the count check.
 */
export async function createProject(
  ownerId: string,
  name: string,
  database: Database = defaultDb,
): Promise<CreateProjectResult> {
  // The dashboard creates the account on first visit; an API call may come first.
  await ensureAccount(ownerId, database);

  const result = await database.transaction(async (tx): Promise<CreateProjectResult> => {
    const [account] = await tx
      .select({ plan: accounts.plan })
      .from(accounts)
      .where(eq(accounts.clerkUserId, ownerId))
      .for("update");
    const limit = PLAN_LIMITS[account?.plan ?? "free"].projects;

    const [owned] = await tx.select({ n: count() }).from(projects).where(eq(projects.ownerId, ownerId));
    if ((owned?.n ?? 0) >= limit) return { ok: false, reason: "plan_limit", limit };

    const [project] = await tx
      .insert(projects)
      .values({ ownerId, name, publicKey: generatePublicKey() })
      .returning();
    // Column defaults are the widget defaults; null text fields fall back to WIDGET_DEFAULTS.
    await tx.insert(widgetConfigs).values({ projectId: project!.id });
    return { ok: true, project: project! };
  });
  // After commit, so a rolled-back create is never counted.
  if (result.ok) captureServerEvent(ownerId, "project_created", { project_id: result.project.id });
  return result;
}

/** Renames an owned project. Null if it doesn't exist or isn't owned by `ownerId`. */
export async function renameProject(
  id: string,
  ownerId: string,
  name: string,
  database: Database = defaultDb,
): Promise<ProjectRow | null> {
  if (!(await getOwnedProject(id, ownerId, database))) return null;
  const [project] = await database
    .update(projects)
    .set({ name })
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
    .returning();
  return project ?? null;
}

/** Hard-deletes an owned project; its config, sources, chunks and conversations cascade. */
export async function deleteProject(id: string, ownerId: string, database: Database = defaultDb): Promise<boolean> {
  if (!(await getOwnedProject(id, ownerId, database))) return false;
  const deleted = await database
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
    .returning({ id: projects.id });
  return deleted.length > 0;
}
