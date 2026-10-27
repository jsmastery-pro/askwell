// Row-level security from supabase/migrations, on pglite with Supabase's roles, auth.jwt() and
// default privileges recreated (supabase-pglite.ts). Each test seeds two owners in one
// transaction, acts as an API role, and rolls back, so the database stays empty.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { actAs, createSupabaseTestDb } from "./supabase-pglite";

const A = "user_a";
const B = "user_b";
const PROJECT_A = "00000000-0000-4000-8000-00000000000a";
const PROJECT_B = "00000000-0000-4000-8000-00000000000b";

const CHILD_TABLES = ["widget_configs", "knowledge_sources", "knowledge_chunks", "conversations"] as const;
const ALL_TABLES = ["accounts", "projects", ...CHILD_TABLES, "messages"] as const;

async function seed(db: PGlite) {
  for (const [owner, project] of [
    [A, PROJECT_A],
    [B, PROJECT_B],
  ] as const) {
    await db.query("INSERT INTO accounts (clerk_user_id) VALUES ($1)", [owner]);
    await db.query("INSERT INTO projects (id, owner_id, name, public_key) VALUES ($1, $2, $3, $4)", [
      project,
      owner,
      `${owner}'s project`,
      `pk_${owner}`,
    ]);
    await db.query("INSERT INTO widget_configs (project_id) VALUES ($1)", [project]);
    const source = await db.query<{ id: string }>(
      "INSERT INTO knowledge_sources (project_id, title, type) VALUES ($1, 'FAQ', 'text') RETURNING id",
      [project],
    );
    await db.query(
      `INSERT INTO knowledge_chunks (project_id, source_id, content, embedding)
       VALUES ($1, $2, 'chunk', array_fill(0.1::real, ARRAY[1536])::extensions.vector)`,
      [project, source.rows[0]!.id],
    );
    const conversation = await db.query<{ id: string }>(
      "INSERT INTO conversations (project_id, visitor_id) VALUES ($1, 'visitor') RETURNING id",
      [project],
    );
    await db.query("INSERT INTO messages (conversation_id, role, body) VALUES ($1, 'visitor', 'hi')", [
      conversation.rows[0]!.id,
    ]);
  }
}

/** Project IDs a table's visible rows belong to (messages through their conversation). */
async function visibleProjects(db: PGlite, table: (typeof ALL_TABLES)[number]): Promise<string[]> {
  const sql = {
    accounts: "SELECT clerk_user_id AS project FROM accounts",
    projects: "SELECT id AS project FROM projects",
    messages: "SELECT c.project_id AS project FROM messages m JOIN conversations c ON c.id = m.conversation_id",
  }[table as string] ?? `SELECT project_id AS project FROM ${table}`;
  const { rows } = await db.query<{ project: string }>(sql);
  return rows.map((r) => r.project);
}

// Both Data API defaults: existing projects auto-grant new tables to the API roles, new projects
// don't. The migration grants and revokes explicitly, so every case must hold under both.
describe.each([
  { autoExposeNewTables: true, label: "auto-exposed tables" },
  { autoExposeNewTables: false, label: "opt-in exposure" },
])("Supabase RLS ($label)", ({ autoExposeNewTables }) => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createSupabaseTestDb({ autoExposeNewTables });
  });
  beforeEach(async () => {
    await db.exec("BEGIN");
    await seed(db);
  });
  afterEach(async () => {
    await db.exec("ROLLBACK");
  });
  afterAll(async () => {
    await db.close();
  });

  it("shows owner A only A's account, projects and child rows, never B's", async () => {
    await actAs(db, A);
    expect(await visibleProjects(db, "accounts")).toEqual([A]);
    for (const table of ["projects", ...CHILD_TABLES] as const) {
      expect(await visibleProjects(db, table), table).toEqual([PROJECT_A]);
    }
    // messages joins conversations, which A only sees for A's project anyway; check messages alone too.
    expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM messages")).rows[0]!.n).toBe(1);
    expect((await db.query("SELECT * FROM knowledge_chunks WHERE project_id = $1", [PROJECT_B])).rows).toEqual([]);
  });

  it("gives anon nothing on any table", async () => {
    for (const table of ALL_TABLES) {
      await db.query("SAVEPOINT s");
      await actAs(db, null);
      await expect(db.query(`SELECT * FROM ${table}`), table).rejects.toThrow(/permission denied/);
      await db.query("ROLLBACK TO SAVEPOINT s");
    }
  });

  it("doesn't let an owner insert a project directly", async () => {
    await actAs(db, A);
    await expect(
      db.query("INSERT INTO projects (owner_id, name, public_key) VALUES ($1, 'direct', 'pk_direct')", [A]),
    ).rejects.toThrow(/permission denied/);
  });

  it("doesn't let an owner write child tables directly", async () => {
    await actAs(db, A);
    for (const sql of [
      "UPDATE widget_configs SET label = 'x'",
      "INSERT INTO knowledge_sources (project_id, title, type) VALUES ($1, 't', 'text')",
      "DELETE FROM messages",
    ]) {
      await db.query("SAVEPOINT s");
      await expect(db.query(sql, sql.includes("$1") ? [PROJECT_A] : []), sql).rejects.toThrow(/permission denied/);
      await db.query("ROLLBACK TO SAVEPOINT s");
    }
  });

  it("lets an owner rename only their own project, and not touch the quota or key", async () => {
    await actAs(db, A);
    expect((await db.query("UPDATE projects SET name = 'renamed' WHERE id = $1", [PROJECT_A])).affectedRows).toBe(1);
    expect((await db.query("UPDATE projects SET name = 'hijacked' WHERE id = $1", [PROJECT_B])).affectedRows).toBe(0);
    for (const column of ["messages_used = 0", "public_key = 'pk_new'", "owner_id = 'user_b'"]) {
      await db.query("SAVEPOINT s");
      await expect(db.query(`UPDATE projects SET ${column} WHERE id = $1`, [PROJECT_A]), column).rejects.toThrow(
        /permission denied/,
      );
      await db.query("ROLLBACK TO SAVEPOINT s");
    }
  });

  it("cascades an owner's project delete to every child table, and can't delete B's", async () => {
    await actAs(db, A);
    expect((await db.query("DELETE FROM projects WHERE id = $1", [PROJECT_B])).affectedRows).toBe(0);
    expect((await db.query("DELETE FROM projects WHERE id = $1", [PROJECT_A])).affectedRows).toBe(1);

    await db.query("RESET ROLE");
    for (const table of ["projects", ...CHILD_TABLES, "messages"] as const) {
      expect(await visibleProjects(db, table), table).toEqual([PROJECT_B]);
    }
  });

  it("denies TRUNCATE to both API roles", async () => {
    for (const user of [A, null]) {
      await db.query("SAVEPOINT s");
      await actAs(db, user);
      await expect(db.query("TRUNCATE messages")).rejects.toThrow(/permission denied/);
      await db.query("ROLLBACK TO SAVEPOINT s");
    }
  });

  it("pins the ownership helpers' search_path and keeps them from anon", async () => {
    const { rows } = await db.query<{ proname: string; proconfig: string[]; anon: boolean }>(
      `SELECT proname, proconfig, has_function_privilege('anon', oid, 'EXECUTE') AS anon
       FROM pg_proc WHERE proname IN ('owns_project', 'owns_conversation') ORDER BY proname`,
    );
    expect(rows).toEqual([
      { proname: "owns_conversation", proconfig: ['search_path=""'], anon: false },
      { proname: "owns_project", proconfig: ['search_path=""'], anon: false },
    ]);
  });
});
