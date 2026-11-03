// The owner's projects (project.md §6.3, §8 owner routes).
//
// Reads, renames and deletes go through the OWNER client, so RLS scopes them
// to the caller's own projects and no owner filter appears here (§9 "Tenant
// leak"). Only creating a project uses the SERVICE client: owners can't insert
// rows, and create_project() checks the plan limit under a row lock (§7).
import "server-only";
import { randomBytes } from "node:crypto";
import { PLAN_LIMITS, PUBLIC_KEY_PREFIX, type Plan, type Project } from "@askwell/shared";
import { createOwnerClient } from "../supabase/owner";
import { createServiceClient } from "../supabase/service";

/** The columns of a Project, in the order the shared type lists them. */
const PROJECT_COLUMNS = "id, owner_id, name, public_key, messages_used, period_start, created_at";

/** A projects read or write failed for a reason the caller can't fix. */
export class ProjectError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectError";
  }
}

/** The owner is at their plan's project limit (create_project raised `plan_limit_reached`). */
export class PlanLimitError extends Error {
  readonly plan: Plan;
  readonly limit: number;

  constructor(plan: Plan, limit: number) {
    super(`Your ${plan === "free" ? "Free" : "Pro"} plan allows ${limit} project${limit === 1 ? "" : "s"}.`);
    this.name = "PlanLimitError";
    this.plan = plan;
    this.limit = limit;
  }
}

/**
 * A new public key: "pk_" + 24 random bytes in base64url (32 characters).
 * Matches `publicKeySchema`; the key only identifies a project (§9).
 */
export function generatePublicKey(): string {
  return `${PUBLIC_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
}

/**
 * The caller's project with this id, or null if it doesn't exist or isn't
 * theirs (RLS hides other owners' rows). Every route that writes to a
 * project with the service client checks this first (§9).
 */
export async function getOwnedProject(id: string): Promise<Project | null> {
  const owner = await createOwnerClient();
  const { data, error } = await owner.from("projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new ProjectError("Couldn't read the project.", { cause: error });
  return data;
}

/** The caller's projects, newest first. */
export async function listOwnProjects(): Promise<Project[]> {
  const owner = await createOwnerClient();
  const { data, error } = await owner
    .from("projects")
    .select(PROJECT_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw new ProjectError("Couldn't list your projects.", { cause: error });
  return data;
}

/** Postgres error fields supabase-js passes through. */
type PostgresError = { code?: string; message?: string };

/** How many times to retry a public key collision (astronomically unlikely). */
const KEY_ATTEMPTS = 3;

/**
 * Creates a project for `ownerId` through create_project(), with the
 * project limit of the plan the server read (`plan`, never from the client).
 * Throws PlanLimitError at the limit.
 */
export async function createProject(ownerId: string, name: string, plan: Plan): Promise<Project> {
  const limit = PLAN_LIMITS[plan].projects;
  const service = createServiceClient();

  for (let attempt = 1; ; attempt++) {
    const { data, error } = await service.rpc("create_project", {
      p_owner_id: ownerId,
      p_name: name,
      p_public_key: generatePublicKey(),
      p_max_projects: limit,
    });
    if (!error) {
      if (!data) throw new ProjectError("create_project returned no project.");
      return data;
    }

    const { code, message } = error as PostgresError;
    if (code === "P0001" && message === "plan_limit_reached") throw new PlanLimitError(plan, limit);
    const keyCollision = code === "23505" && message?.includes("projects_public_key_key");
    if (keyCollision && attempt < KEY_ATTEMPTS) continue;
    throw new ProjectError("Couldn't create the project.", { cause: error });
  }
}

/**
 * Renames the caller's project. Returns null if it isn't theirs. The owner
 * client can only change `name` (column grant + RLS update policy).
 */
export async function renameOwnProject(id: string, name: string): Promise<Project | null> {
  const owner = await createOwnerClient();
  const { data, error } = await owner
    .from("projects")
    .update({ name })
    .eq("id", id)
    .select(PROJECT_COLUMNS)
    .maybeSingle();
  if (error) throw new ProjectError("Couldn't rename the project.", { cause: error });
  return data;
}

/**
 * Deletes the caller's project (its config, knowledge and conversations go
 * with it, on delete cascade). Returns the id, or null if it isn't theirs.
 */
export async function deleteOwnProject(id: string): Promise<string | null> {
  const owner = await createOwnerClient();
  const { data, error } = await owner.from("projects").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw new ProjectError("Couldn't delete the project.", { cause: error });
  return data?.id ?? null;
}
