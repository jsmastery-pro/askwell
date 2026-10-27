import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));

/**
 * The parts of a Supabase database that supabase/migrations relies on, recreated on pglite: the
 * API roles, the `auth` and `extensions` schemas, `auth.jwt()` as Supabase defines it, and the
 * default privileges Supabase gives its API roles on everything new in `public` (so a migration
 * that forgets to revoke something is caught here as it would be on Supabase).
 */
const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN NOINHERIT;
  CREATE ROLE authenticated NOLOGIN NOINHERIT;
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;

  CREATE SCHEMA auth;
  CREATE SCHEMA extensions;
  GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;

  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
  $$;
  GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
`;

/** A fresh in-memory database with the Supabase stubs and every migration in supabase/migrations. */
export async function createSupabaseTestDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

/**
 * Switches the current transaction to an API role, as Supabase does for a Data API request:
 * `authenticated` with a Clerk session token's claims, or `anon` with none.
 */
export async function actAs(db: PGlite, clerkUserId: string | null): Promise<void> {
  const role = clerkUserId ? "authenticated" : "anon";
  const claims = clerkUserId ? { sub: clerkUserId, role } : { role };
  await db.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
  await db.exec(`SET LOCAL ROLE ${role}`);
}
