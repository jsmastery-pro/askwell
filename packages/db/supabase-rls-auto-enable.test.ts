// The SB-T13 migration (audit S1) on pglite with Supabase's roles recreated (supabase-pglite.ts).
// createSupabaseTestDb has already run it once with no rls_auto_enable() (the function is
// Supabase's, not ours); each test then runs the same file again, with or without a stub of it.
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSupabaseTestDb } from "./supabase-pglite";

const MIGRATION = readFileSync(
  new URL("../../supabase/migrations/20261027204103_revoke_rls_auto_enable.sql", import.meta.url),
  "utf8",
);

/**
 * As Supabase creates it: SECURITY DEFINER with a pinned search_path, executable by everyone, and
 * wired to an event trigger. This stub logs each CREATE TABLE so a test can see the trigger fire.
 */
const STUB = `
  CREATE TABLE public.rls_auto_enable_log (object_identity text);
  CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
  DECLARE cmd record;
  BEGIN
    FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag = 'CREATE TABLE' LOOP
      INSERT INTO public.rls_auto_enable_log VALUES (cmd.object_identity);
    END LOOP;
  END
  $$;
  GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC, anon, authenticated, service_role;
  CREATE EVENT TRIGGER ensure_rls ON ddl_command_end EXECUTE FUNCTION public.rls_auto_enable();
`;

const canExecute = async (db: PGlite, role: string) =>
  (
    await db.query<{ ok: boolean }>("SELECT has_function_privilege($1, 'public.rls_auto_enable()', 'EXECUTE') AS ok", [
      role,
    ])
  ).rows[0]!.ok;

type Fn = { owner: string; secdef: boolean; config: string[]; acl: string | null; body: string };
const fn = async (db: PGlite) =>
  (
    await db.query<Fn>(
      `SELECT pg_get_userbyid(proowner) AS owner, prosecdef AS secdef, proconfig AS config, proacl::text AS acl, prosrc AS body
       FROM pg_proc WHERE oid = 'public.rls_auto_enable()'::regprocedure`,
    )
  ).rows[0]!;

let db: PGlite;

beforeEach(async () => {
  db = await createSupabaseTestDb();
});

afterEach(() => db.close());

describe("revoke EXECUTE on rls_auto_enable()", () => {
  it("leaves PUBLIC, anon and authenticated without EXECUTE when the function exists", async () => {
    await db.exec(STUB);
    for (const role of ["anon", "authenticated", "service_role"]) expect(await canExecute(db, role)).toBe(true);

    await db.exec(MIGRATION);

    expect(await canExecute(db, "anon")).toBe(false);
    expect(await canExecute(db, "authenticated")).toBe(false);
    // No PUBLIC entry ("=X/...") left in the ACL; the owner and service_role keep theirs.
    expect((await fn(db)).acl).not.toMatch(/(^|[{,])=/);
    expect(await canExecute(db, "service_role")).toBe(true);
  });

  it("changes nothing else about the function, and its event trigger still fires", async () => {
    await db.exec(STUB);
    const before = await fn(db);

    await db.exec(MIGRATION);

    const after = await fn(db);
    expect({ ...after, acl: null }).toEqual({ ...before, acl: null });
    // Event triggers don't check EXECUTE when they fire, so a role that just lost it is still covered.
    await db.exec(`
      CREATE ROLE ddl_user NOLOGIN;
      GRANT CREATE ON SCHEMA public TO ddl_user;
      SET ROLE ddl_user;
      CREATE TABLE public.made_by_ddl_user (id int);
      RESET ROLE;
    `);
    expect(await canExecute(db, "ddl_user")).toBe(false);
    const { rows } = await db.query<{ object_identity: string }>("SELECT object_identity FROM public.rls_auto_enable_log");
    expect(rows.map((r) => r.object_identity)).toContain("public.made_by_ddl_user");
  });

  it("is a no-op when the function doesn't exist", async () => {
    expect((await db.query("SELECT to_regprocedure('public.rls_auto_enable()') AS fn")).rows).toEqual([{ fn: null }]);

    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
  });
});
