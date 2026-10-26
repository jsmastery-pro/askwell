// Row-level security on every table (MV-T03): Supabase's Data API reaches the database as the
// `anon` / `authenticated` roles, which must see nothing; the app connects as the tables' owner.
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { getTableConfig } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./index";

const TABLE_CONFIGS = [
  schema.accounts,
  schema.projects,
  schema.widgetConfigs,
  schema.knowledgeSources,
  schema.knowledgeChunks,
  schema.conversations,
  schema.messages,
].map((t) => getTableConfig(t));
const TABLES = TABLE_CONFIGS.map((t) => t.name);

let client: PGlite;

beforeAll(async () => {
  client = new PGlite({ extensions: { vector } });
  // Like a Supabase project: its API roles exist before our migrations, and default privileges
  // give them every privilege on new tables, TRUNCATE included.
  await client.exec(`
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  await migrate(drizzle(client, { schema }), {
    migrationsFolder: new URL("../migrations", import.meta.url).pathname,
  });
  await client.exec(`
    insert into accounts (clerk_user_id) values ('user_rls');
    insert into projects (owner_id, name, public_key) values ('user_rls', 'RLS', 'pk_rls');
  `);
});

afterAll(() => client.close());

describe("row-level security", () => {
  it("declares RLS on every table in the schema", () => {
    expect(TABLE_CONFIGS).toHaveLength(7);
    for (const config of TABLE_CONFIGS) expect(config.enableRLS, config.name).toBe(true);
  });

  it("is enabled on all 7 tables after migrating, without FORCE", async () => {
    const { rows } = await client.query<{ relname: string; on: boolean; force: boolean }>(
      `select relname, relrowsecurity as on, relforcerowsecurity as force
         from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
    );
    expect(rows.map((r) => r.relname).sort()).toEqual([...TABLES].sort());
    for (const row of rows) expect(row).toMatchObject({ on: true, force: false });
  });

  it("shows a non-owner role (like Supabase's anon) no rows, and lets it write nothing", async () => {
    await client.exec("set role anon");
    try {
      for (const table of TABLES) {
        const { rows } = await client.query(`select * from "${table}"`);
        expect(rows, table).toHaveLength(0);
      }
      await expect(client.query(`insert into accounts (clerk_user_id) values ('user_anon')`)).rejects.toThrow(
        /row-level security/,
      );
      const updated = await client.query(`update projects set name = 'pwned'`);
      expect(updated.affectedRows ?? 0).toBe(0);
    } finally {
      await client.exec("reset role");
    }
  });

  it("takes TRUNCATE (which RLS doesn't cover) away from both API roles on every table", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const table of TABLES) {
        const { rows } = await client.query<{ allowed: boolean }>(
          `select has_table_privilege($1, $2, 'TRUNCATE') as allowed`,
          [role, `public."${table}"`],
        );
        expect(rows[0]!.allowed, `${role} on ${table}`).toBe(false);
      }
    }
    await client.exec("set role anon");
    try {
      await expect(client.query(`truncate projects cascade`)).rejects.toThrow(/permission denied/);
    } finally {
      await client.exec("reset role");
    }
  });

  it("leaves the owner (how the app connects) unaffected", async () => {
    const { rows } = await client.query<{ name: string }>(`select name from projects where public_key = 'pk_rls'`);
    expect(rows).toEqual([{ name: "RLS" }]);
    await client.exec(`insert into accounts (clerk_user_id) values ('user_owner_write')`);
  });
});
