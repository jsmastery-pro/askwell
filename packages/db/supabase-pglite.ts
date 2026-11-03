// TEST-ONLY. A pglite database shaped like a Supabase project, so migrations,
// RLS policies and functions can be tested without a local Supabase stack,
// Docker or the shared dev project (CLAUDE.md "Database rules").
//
// Import it from "@askwell/db/testing" in tests only. Never import it from
// apps/web runtime code: it pulls in a WASM Postgres and node:fs, and pglite
// is a devDependency of @askwell/db.
//
// What it mirrors was read from the askwell-dev project on 2026-11-03
// (pg_roles, pg_default_acl, pg_namespace ACLs and the auth.* function
// definitions). Known gaps: pglite runs Postgres 18 (dev runs 17), its
// `postgres` user is a superuser (Supabase's is not), and per-role settings
// such as statement_timeout are not applied by `set role`.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { vector } from "@electric-sql/pglite-pgvector";

export type SupabaseRole = "anon" | "authenticated" | "service_role";
export type JwtClaims = Record<string, unknown>;

/** `supabase/migrations` at the repo root. */
export const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../supabase/migrations", import.meta.url),
);

const SUPABASE_BOOTSTRAP = /* sql */ `
-- API roles. Supabase creates these three as NOLOGIN, INHERIT roles; PostgREST
-- logs in as "authenticator" and switches to one of them per request.
-- service_role has BYPASSRLS, so RLS never applies to the secret key.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

-- The "extensions" schema. Supabase installs extensions here, and the API
-- roles may use it. pgcrypto and uuid-ossp come pre-installed on every
-- project. vector is available but not enabled: a migration enables it with
-- "create extension vector with schema extensions", as it must on Supabase.
create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;

-- The "auth" schema with Supabase's auth.jwt(), auth.uid() and auth.role(),
-- copied from askwell-dev. They read the claims PostgREST puts in
-- request.jwt.claims. EXECUTE stays granted to PUBLIC, as on Supabase.
-- auth.uid() casts "sub" to uuid. Clerk user IDs ("user_...") are not UUIDs,
-- so our policies use auth.jwt()->>'sub' (project.md section 3, Auth row).
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create function auth.jwt() returns jsonb
language sql stable
as $$
  select
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;

create function auth.uid() returns uuid
language sql stable
as $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.role() returns text
language sql stable
as $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

-- The "public" schema. Supabase grants USAGE on it to the API roles (on top
-- of Postgres's own USAGE for PUBLIC).
grant usage on schema public to anon, authenticated, service_role;

-- Supabase's default privileges on "public" for objects that "postgres" (the
-- role migrations run as) creates: ALL on tables, sequences and functions to
-- anon, authenticated and service_role. So a new table is reachable through
-- the Data API until a migration revokes it; RLS and explicit revokes are the
-- boundary (project.md section 9, Database API).
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
`;

/**
 * A fresh in-memory Postgres with Supabase's roles, auth schema, extensions
 * schema and default grants. The vector extension is loaded, not enabled.
 */
export async function createTestDb(): Promise<PGlite> {
  const db = await PGlite.create({
    extensions: { vector, pgcrypto, uuid_ossp },
  });
  await db.exec(SUPABASE_BOOTSTRAP);
  // Supabase's search_path for postgres and for API requests.
  await db.exec(`set search_path to "$user", public, extensions`);
  return db;
}

/**
 * Runs every `*.sql` file in `dir` in filename order, each in its own
 * transaction, the way `supabase db push` applies them. Returns the file
 * names it ran. A missing folder runs nothing.
 */
export async function applyMigrations(
  db: PGlite,
  dir: string = MIGRATIONS_DIR,
): Promise<string[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const migrations = files.filter((file) => file.endsWith(".sql")).sort();
  for (const file of migrations) {
    const sql = await readFile(join(dir, file), "utf8");
    try {
      await db.transaction((tx) => tx.exec(sql));
    } catch (error) {
      throw new Error(`Migration ${file} failed`, { cause: error });
    }
  }
  return migrations;
}

const ROLES: ReadonlySet<string> = new Set<SupabaseRole>([
  "anon",
  "authenticated",
  "service_role",
]);

/**
 * Runs `fn` in a transaction as `role`, with `request.jwt.claims` set the way
 * PostgREST sets it. Claims default to `{ role }`. The transaction commits
 * when `fn` resolves and rolls back when it throws.
 *
 *   asRole(db, "anon", (tx) => ...)
 *   asRole(db, "authenticated", { sub: "user_123" }, (tx) => ...)
 *   asRole(db, "service_role", (tx) => ...)
 */
export function asRole<T>(
  db: PGlite,
  role: SupabaseRole,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T>;
export function asRole<T>(
  db: PGlite,
  role: SupabaseRole,
  claims: JwtClaims,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T>;
export function asRole<T>(
  db: PGlite,
  role: SupabaseRole,
  claimsOrFn: JwtClaims | ((tx: Transaction) => Promise<T>),
  maybeFn?: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const fn = typeof claimsOrFn === "function" ? claimsOrFn : maybeFn;
  const claims = typeof claimsOrFn === "function" ? {} : claimsOrFn;
  if (!fn) throw new TypeError("asRole needs a callback");
  if (!ROLES.has(role)) throw new TypeError(`Unknown role: ${String(role)}`);

  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role, ...claims }),
    ]);
    // Safe to interpolate: role is one of the three names above.
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}
