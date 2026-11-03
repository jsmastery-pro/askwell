// Tests for public.create_project() (P2P-T02), on the pglite helper.
// It must create a project with its default widget config, refuse past the
// plan limit without writing anything, and be callable by service_role only.
import type { PGlite } from "@electric-sql/pglite";
import { DEFAULT_WIDGET_CONFIG, PLAN_LIMITS } from "@askwell/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, asRole, createTestDb } from "@askwell/db/testing";

const OWNER = "user_owner";
const OTHER = "user_other";

type ProjectRow = {
  id: string;
  owner_id: string;
  name: string;
  public_key: string;
  messages_used: number;
  period_start: string;
  created_at: string;
};

// One migrated database with two accounts, emptied of projects after each
// test. A single pglite instance per file (no clones) keeps memory low enough
// for the db test files to run in parallel in a 4 GB sandbox.
let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await applyMigrations(db);
  await db.exec(`insert into public.accounts (clerk_user_id) values ('${OWNER}'), ('${OTHER}')`);
});

afterAll(async () => {
  await db.close();
});

afterEach(async () => {
  // As postgres: widget_configs go with their projects (on delete cascade).
  await db.exec("delete from public.projects");
});

/** Calls create_project as service_role, the way the server's service client does. */
function createProject(owner: string, name: string, key: string, max: number): Promise<ProjectRow> {
  return asRole(db, "service_role", async (tx) => {
    const { rows } = await tx.query<ProjectRow>(
      "select * from public.create_project($1, $2, $3, $4)",
      [owner, name, key, max],
    );
    const row = rows[0];
    if (!row) throw new Error("create_project returned no row");
    return row;
  });
}

/** The SQLSTATE and message create_project raised. */
async function raised(promise: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    const { code, message } = error as { code?: string; message: string };
    return { code, message };
  }
  throw new Error("Expected create_project to raise");
}

async function count(table: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`);
  return rows[0]?.n ?? -1;
}

describe("create_project", () => {
  it("creates the project and returns its row", async () => {
    const project = await createProject(OWNER, "Docs bot", "pk_docs", PLAN_LIMITS.free.projects);
    expect(project).toMatchObject({
      owner_id: OWNER,
      name: "Docs bot",
      public_key: "pk_docs",
      messages_used: 0,
    });
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);

    const { rows } = await db.query<ProjectRow>("select * from public.projects");
    expect(rows).toEqual([project]);
  });

  it("creates the project's widget config with the defaults (DEFAULT_WIDGET_CONFIG)", async () => {
    const project = await createProject(OWNER, "Docs bot", "pk_docs", 1);
    const { rows } = await db.query(
      `select button_color, position, label, animation, header_text, show_badge
       from public.widget_configs where project_id = $1`,
      [project.id],
    );
    expect(rows).toEqual([DEFAULT_WIDGET_CONFIG]);
  });

  it.each([
    ["Free", PLAN_LIMITS.free.projects],
    ["Pro", PLAN_LIMITS.pro.projects],
  ])("allows exactly the %s limit (%i), then raises plan_limit_reached and writes nothing", async (_plan, max) => {
    for (let i = 0; i < max; i++) await createProject(OWNER, `Project ${i}`, `pk_owner_${i}`, max);
    expect(await count("projects")).toBe(max);

    expect(await raised(createProject(OWNER, "One too many", "pk_extra", max))).toEqual({
      code: "P0001",
      message: "plan_limit_reached",
    });
    expect(await count("projects")).toBe(max);
    expect(await count("widget_configs")).toBe(max);
    const { rows } = await db.query("select 1 from public.projects where public_key = 'pk_extra'");
    expect(rows).toEqual([]);
  });

  it("counts only the owner's own projects", async () => {
    await createProject(OTHER, "Theirs", "pk_theirs", 1);
    await expect(createProject(OWNER, "Mine", "pk_mine", 1)).resolves.toMatchObject({ owner_id: OWNER });
  });

  it("raises account_not_found for an owner without an accounts row, and writes nothing", async () => {
    expect(await raised(createProject("user_nobody", "Ghost", "pk_ghost", 5))).toEqual({
      code: "P0002",
      message: "account_not_found",
    });
    expect(await count("projects")).toBe(0);
    expect(await count("widget_configs")).toBe(0);
  });

  it.each([
    ["null", null],
    ["negative", -1],
  ])("raises invalid_max_projects for a %s limit", async (_label, max) => {
    const call = asRole(db, "service_role", (tx) =>
      tx.query("select public.create_project($1, $2, $3, $4)", [OWNER, "X", "pk_x", max]),
    );
    expect(await raised(call)).toEqual({ code: "22023", message: "invalid_max_projects" });
  });

  it("a limit of 0 refuses every project", async () => {
    expect((await raised(createProject(OWNER, "X", "pk_x", 0))).message).toBe("plan_limit_reached");
  });

  it("leaves the name check to the table (1-60 characters) and writes nothing", async () => {
    const error = await raised(createProject(OWNER, "", "pk_empty", 5));
    expect(error.code).toBe("23514");
    expect(error.message).toContain("projects_name_check");
    expect(await count("projects")).toBe(0);
    expect(await count("widget_configs")).toBe(0);
  });

  it("leaves public key uniqueness to the table (unique_violation) and writes nothing", async () => {
    await createProject(OTHER, "Theirs", "pk_same", 5);
    const error = await raised(createProject(OWNER, "Mine", "pk_same", 5));
    expect(error.code).toBe("23505");
    expect(error.message).toContain("projects_public_key_key");
    expect(await count("projects")).toBe(1);
    expect(await count("widget_configs")).toBe(1);
  });

  it("locks the owner's account row before counting", async () => {
    const { rows } = await db.query<{ def: string }>(
      "select pg_get_functiondef('public.create_project(text, text, text, integer)'::regprocedure) as def",
    );
    const def = (rows[0]?.def ?? "").replace(/\s+/g, " ");
    expect(def).toMatch(/from public\.accounts where clerk_user_id = p_owner_id for update/);
    expect(def.indexOf("for update")).toBeLessThan(def.indexOf("count(*)"));
  });
});

describe("create_project access", () => {
  it.each([
    ["anon", {}],
    ["authenticated", { sub: OWNER }],
  ] as const)("%s gets permission denied, and nothing is written", async (role, claims) => {
    const call = asRole(db, role, claims, (tx) =>
      tx.query("select public.create_project($1, $2, $3, $4)", [OWNER, "Sneaky", "pk_sneaky", 5]),
    );
    expect((await raised(call)).message).toMatch(/permission denied for function create_project/);
    expect(await count("projects")).toBe(0);
  });

  it("only service_role holds EXECUTE (not PUBLIC, anon or authenticated)", async () => {
    const { rows } = await db.query<{ role: string; can: boolean }>(
      `select r as role, has_function_privilege(r, 'public.create_project(text, text, text, integer)', 'execute') as can
       from unnest(array['anon', 'authenticated', 'service_role']) as r order by r`,
    );
    expect(rows).toEqual([
      { role: "anon", can: false },
      { role: "authenticated", can: false },
      { role: "service_role", can: true },
    ]);
    const acl = await db.query<{ public_x: boolean }>(
      `select exists (
         select 1 from pg_proc p, aclexplode(p.proacl) a
         where p.oid = 'public.create_project(text, text, text, integer)'::regprocedure
           and a.grantee = 0 and a.privilege_type = 'EXECUTE'
       ) as public_x`,
    );
    expect(acl.rows[0]?.public_x).toBe(false);
  });

  it("is SECURITY INVOKER, plpgsql, and has search_path = ''", async () => {
    const { rows } = await db.query<{ prosecdef: boolean; lang: string; proconfig: string[] | null }>(
      `select p.prosecdef, l.lanname as lang, p.proconfig
       from pg_proc p join pg_language l on l.oid = p.prolang
       where p.oid = 'public.create_project(text, text, text, integer)'::regprocedure`,
    );
    expect(rows).toEqual([{ prosecdef: false, lang: "plpgsql", proconfig: ['search_path=""'] }]);
  });
});
