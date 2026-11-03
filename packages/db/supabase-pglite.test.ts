import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, asRole, createTestDb } from "@askwell/db";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.close();
});

describe("createTestDb", () => {
  it("loads pgvector so a migration can enable it in the extensions schema", async () => {
    await db.exec("create extension vector with schema extensions");
    const { rows } = await db.query<{ distance: number }>(
      "select '[1,0,0]'::vector <=> '[0,1,0]'::vector as distance",
    );
    expect(rows[0]?.distance).toBe(1);
  });

  it("creates the API roles like Supabase", async () => {
    const { rows } = await db.query<{
      rolname: string;
      rolcanlogin: boolean;
      rolbypassrls: boolean;
    }>(
      `select rolname, rolcanlogin, rolbypassrls from pg_roles
       where rolname in ('anon', 'authenticated', 'service_role')
       order by rolname`,
    );
    expect(rows).toEqual([
      { rolname: "anon", rolcanlogin: false, rolbypassrls: false },
      { rolname: "authenticated", rolcanlogin: false, rolbypassrls: false },
      { rolname: "service_role", rolcanlogin: false, rolbypassrls: true },
    ]);
  });

  it("pre-installs pgcrypto and uuid-ossp in extensions", async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      "select gen_random_bytes(4) is not null and uuid_generate_v4() is not null as ok",
    );
    expect(rows[0]?.ok).toBe(true);
  });

  it("grants new public tables to the API roles by default", async () => {
    await db.exec("create table public.grants_probe (id int)");
    const { rows } = await db.query<{ grantee: string }>(
      `select distinct grantee from information_schema.role_table_grants
       where table_name = 'grants_probe' and privilege_type = 'SELECT'
       order by grantee`,
    );
    expect(rows.map((row) => row.grantee)).toEqual([
      "anon",
      "authenticated",
      "postgres",
      "service_role",
    ]);
  });
});

describe("asRole", () => {
  it("exposes the claims through auth.jwt() and switches role", async () => {
    const owner = await asRole(
      db,
      "authenticated",
      { sub: "user_123" },
      async (tx) =>
        (
          await tx.query<{ sub: string; role: string; current_user: string }>(
            "select auth.jwt()->>'sub' as sub, auth.role() as role, current_user",
          )
        ).rows[0],
    );
    expect(owner).toEqual({
      sub: "user_123",
      role: "authenticated",
      current_user: "authenticated",
    });

    const anon = await asRole(
      db,
      "anon",
      async (tx) =>
        (
          await tx.query<{ sub: string | null; role: string; current_user: string }>(
            "select auth.jwt()->>'sub' as sub, auth.role() as role, current_user",
          )
        ).rows[0],
    );
    expect(anon).toEqual({ sub: null, role: "anon", current_user: "anon" });
  });

  it("resets the role and claims after the transaction", async () => {
    await asRole(db, "anon", async () => undefined);
    const { rows } = await db.query<{ current_user: string; claims: string | null }>(
      "select current_user, nullif(current_setting('request.jwt.claims', true), '') as claims",
    );
    expect(rows[0]).toEqual({ current_user: "postgres", claims: null });
  });

  it("rolls back when the callback throws", async () => {
    await db.exec("create table public.rollback_probe (id int)");
    await expect(
      asRole(db, "service_role", async (tx) => {
        await tx.exec("insert into public.rollback_probe values (1)");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.rollback_probe",
    );
    expect(rows[0]?.n).toBe(0);
  });

  it("enforces RLS: rows are hidden from anon and visible to service_role and the owner", async () => {
    await db.exec(`
      create table public.notes (id int primary key, owner_id text not null);
      alter table public.notes enable row level security;
      create policy notes_owner_select on public.notes
        for select to authenticated
        using (owner_id = (select auth.jwt()->>'sub'));
      insert into public.notes values (1, 'user_123'), (2, 'user_456');
    `);
    const count = (tx: Transaction) =>
      tx
        .query<{ n: number }>("select count(*)::int as n from public.notes")
        .then((result) => result.rows[0]?.n);

    expect(await asRole(db, "anon", count)).toBe(0);
    expect(await asRole(db, "service_role", count)).toBe(2);
    expect(await asRole(db, "authenticated", { sub: "user_123" }, count)).toBe(1);
  });

  it("rejects an unknown role", () => {
    expect(() =>
      asRole(db, "postgres" as "anon", async () => undefined),
    ).toThrow("Unknown role");
  });
});

describe("applyMigrations", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "askwell-migrations-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("does nothing when the folder is missing", async () => {
    await expect(applyMigrations(db, join(dir, "missing"))).resolves.toEqual([]);
  });

  it("runs .sql files in filename order", async () => {
    await writeFile(
      join(dir, "20260101000002_add_row.sql"),
      "insert into public.migration_probe values (2);",
    );
    await writeFile(
      join(dir, "20260101000001_create_table.sql"),
      "create table public.migration_probe (id int); insert into public.migration_probe values (1);",
    );
    await writeFile(join(dir, "README.md"), "not a migration");

    await expect(applyMigrations(db, dir)).resolves.toEqual([
      "20260101000001_create_table.sql",
      "20260101000002_add_row.sql",
    ]);
    const { rows } = await db.query<{ id: number }>(
      "select id from public.migration_probe order by id",
    );
    expect(rows.map((row) => row.id)).toEqual([1, 2]);
  });

  it("names the failing file and rolls that migration back", async () => {
    await writeFile(
      join(dir, "20260101000001_bad.sql"),
      "create table public.half_done (id int); select * from no_such_table;",
    );
    await expect(applyMigrations(db, dir)).rejects.toThrow(
      "Migration 20260101000001_bad.sql failed",
    );
    const { rows } = await db.query<{ exists: boolean }>(
      "select to_regclass('public.half_done') is not null as exists",
    );
    expect(rows[0]?.exists).toBe(false);
  });
});
