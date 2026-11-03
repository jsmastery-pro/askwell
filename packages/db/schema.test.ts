// Schema tests for the initial migration (P1F-T04), run on the pglite helper.
// The Data API is public, so these tests are the proof that RLS and grants
// hold: owners see only their own rows, anon gets nothing, authenticated can
// only read, rename and delete its own projects (project.md §7, §9).
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WIDGET_CONFIG,
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  MESSAGE_ROLES,
  PLANS,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
} from "@askwell/shared";
import {
  applyMigrations,
  asRole,
  createTestDb,
  type JwtClaims,
  type SupabaseRole,
} from "@askwell/db/testing";
import type { Database } from "@askwell/db";

const TABLES = [
  "accounts",
  "projects",
  "widget_configs",
  "knowledge_sources",
  "knowledge_chunks",
  "conversations",
  "messages",
] as const;
type Table = (typeof TABLES)[number];

/** Tables whose rows belong to a project, and the projects table itself. */
const PROJECT_SCOPED: readonly Table[] = TABLES.filter((table) => table !== "accounts");

const HELPERS = ["owned_project_ids", "owned_conversation_ids"] as const;

const OWNER_A = "user_aaa";
const OWNER_B = "user_bbb";

/** Fixed IDs so tests can say which rows they expect. */
const IDS = {
  [OWNER_A]: {
    project: "00000000-0000-4000-8000-00000000000a",
    source: "00000000-0000-4000-8000-0000000000a1",
    chunk: "00000000-0000-4000-8000-0000000000a2",
    conversation: "00000000-0000-4000-8000-0000000000a3",
    message: "00000000-0000-4000-8000-0000000000a4",
  },
  [OWNER_B]: {
    project: "00000000-0000-4000-8000-00000000000b",
    source: "00000000-0000-4000-8000-0000000000b1",
    chunk: "00000000-0000-4000-8000-0000000000b2",
    conversation: "00000000-0000-4000-8000-0000000000b3",
    message: "00000000-0000-4000-8000-0000000000b4",
  },
} as const;

/** The column that identifies a row in each table. */
const KEY: Record<Table, string> = {
  accounts: "clerk_user_id",
  projects: "id",
  widget_configs: "project_id",
  knowledge_sources: "id",
  knowledge_chunks: "id",
  conversations: "id",
  messages: "id",
};

/** The key each owner's seeded row has in each table. */
function seededKey(owner: typeof OWNER_A | typeof OWNER_B, table: Table): string {
  const ids = IDS[owner];
  switch (table) {
    case "accounts":
      return owner;
    case "projects":
    case "widget_configs":
      return ids.project;
    case "knowledge_sources":
      return ids.source;
    case "knowledge_chunks":
      return ids.chunk;
    case "conversations":
      return ids.conversation;
    case "messages":
      return ids.message;
  }
}

const EMBEDDING = "array_fill(0.1::real, array[1536])::extensions.vector";

/** Seeds two owners, each with one row in every table (IDs from IDS). */
async function seed(db: PGlite): Promise<void> {
  for (const owner of [OWNER_A, OWNER_B] as const) {
    const ids = IDS[owner];
    await db.exec(`
      insert into public.accounts (clerk_user_id) values ('${owner}');
      insert into public.projects (id, owner_id, name, public_key)
        values ('${ids.project}', '${owner}', 'Project ${owner}', 'pk_${owner}');
      insert into public.widget_configs (project_id) values ('${ids.project}');
      insert into public.knowledge_sources (id, project_id, title, type, status)
        values ('${ids.source}', '${ids.project}', 'FAQ', 'text', 'ready');
      insert into public.knowledge_chunks (id, project_id, source_id, content, embedding)
        values ('${ids.chunk}', '${ids.project}', '${ids.source}', 'Hello', ${EMBEDDING});
      insert into public.conversations (id, project_id, visitor_id)
        values ('${ids.conversation}', '${ids.project}', 'visitor_1');
      insert into public.messages (id, conversation_id, role, body)
        values ('${ids.message}', '${ids.conversation}', 'visitor', 'Hi');
    `);
  }
}

const ownerClaims = (sub: string): JwtClaims => ({ sub });

/** Runs `sql` as `role` and returns the error message it fails with. */
async function errorAs(
  db: PGlite,
  role: SupabaseRole,
  claims: JwtClaims,
  sql: string,
): Promise<string> {
  try {
    await asRole(db, role, claims, (tx) => tx.query(sql));
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error(`Expected "${sql}" to fail as ${role}`);
}

/** Runs as `role` and returns the keys of the rows it can see in `table`, sorted. */
async function keysAs(
  db: PGlite,
  role: SupabaseRole,
  claims: JwtClaims,
  table: Table,
): Promise<string[]> {
  return asRole(db, role, claims, async (tx: Transaction) => {
    const { rows } = await tx.query<{ key: string }>(
      `select ${KEY[table]}::text as key from public.${table} order by 1`,
    );
    return rows.map((row) => row.key);
  });
}

/** Counts every row in `table` as postgres (no RLS). */
async function count(db: PGlite, table: Table): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`);
  return rows[0]?.n ?? -1;
}

// Build the migrated, seeded database once, then give every test its own
// clone (much faster than a fresh pglite per test). A clone doesn't keep the
// session search_path, so set it again as createTestDb does.
let template: PGlite;
let db: PGlite;

beforeAll(async () => {
  template = await createTestDb();
  await applyMigrations(template);
  await seed(template);
});

afterAll(async () => {
  await template.close();
});

beforeEach(async () => {
  const clone = await template.clone();
  if (!(clone instanceof PGlite)) throw new Error("Expected PGlite.clone() to return a PGlite");
  db = clone;
  await db.exec(`set search_path to "$user", public, extensions`);
});

afterEach(async () => {
  await db.close();
});

describe("tables", () => {
  it("creates exactly the 7 tables from §7 in public, all with RLS on", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'
       order by relname`,
    );
    expect(rows.map((row) => row.relname)).toEqual([...TABLES].sort());
    expect(rows.every((row) => row.relrowsecurity)).toBe(true);
  });

  it("enables vector in the extensions schema with an HNSW cosine index on embedding", async () => {
    const ext = await db.query<{ schema: string }>(
      `select extnamespace::regnamespace::text as schema from pg_extension where extname = 'vector'`,
    );
    expect(ext.rows).toEqual([{ schema: "extensions" }]);

    const idx = await db.query<{ method: string; column: string; opclass: string }>(
      `select am.amname as method, a.attname as column,
              opc.opcnamespace::regnamespace::text || '.' || opc.opcname as opclass
       from pg_index i
       join pg_class c on c.oid = i.indexrelid
       join pg_am am on am.oid = c.relam
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
       join pg_opclass opc on opc.oid = i.indclass[0]
       where i.indrelid = 'public.knowledge_chunks'::regclass and am.amname = 'hnsw'`,
    );
    expect(idx.rows).toEqual([
      { method: "hnsw", column: "embedding", opclass: "extensions.vector_cosine_ops" },
    ]);
  });

  it("has an index led by every foreign key column", async () => {
    const { rows } = await db.query<{ fk: string; indexed: boolean }>(
      `select c.conrelid::regclass::text || '.' || a.attname as fk,
              exists (
                select 1 from pg_index i
                where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
              ) as indexed
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'f' and c.connamespace = 'public'::regnamespace
       order by 1`,
    );
    expect(rows.map((row) => row.fk)).toEqual([
      "conversations.project_id",
      "knowledge_chunks.project_id",
      "knowledge_chunks.source_id",
      "knowledge_sources.project_id",
      "messages.conversation_id",
      "projects.owner_id",
      "widget_configs.project_id",
    ]);
    expect(rows.filter((row) => !row.indexed)).toEqual([]);
  });

  it("gives widget_configs the same defaults as DEFAULT_WIDGET_CONFIG", async () => {
    const { rows } = await db.query<Record<string, unknown>>(
      `select button_color, position, label, animation, header_text, show_badge
       from public.widget_configs where project_id = $1`,
      [IDS[OWNER_A].project],
    );
    expect(rows[0]).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it("defaults a new account to the free plan and a new project to 0 messages this month", async () => {
    const { rows } = await db.query<{ plan: string; messages_used: number; month_start: boolean }>(
      `select a.plan, p.messages_used,
              p.period_start = date_trunc('month', now()) as month_start
       from public.accounts a join public.projects p on p.owner_id = a.clerk_user_id
       where a.clerk_user_id = $1`,
      [OWNER_A],
    );
    expect(rows).toEqual([{ plan: "free", messages_used: 0, month_start: true }]);
  });

  it.each([
    ["accounts", "plan", PLANS],
    ["widget_configs", "position", WIDGET_POSITIONS],
    ["widget_configs", "animation", WIDGET_ANIMATIONS],
    ["knowledge_sources", "type", KNOWLEDGE_SOURCE_TYPES],
    ["knowledge_sources", "status", KNOWLEDGE_SOURCE_STATUSES],
    ["messages", "role", MESSAGE_ROLES],
  ] as const)("%s.%s accepts exactly the values in packages/shared", async (table, column, values) => {
    for (const value of values) {
      await db.query(`update public.${table} set ${column} = $1`, [value]);
    }
    await expect(db.query(`update public.${table} set ${column} = 'bogus'`)).rejects.toThrow(
      /violates check constraint/,
    );
  });

  it.each([
    ["#1a2B3c", true],
    ["#000000", true],
    ["#fff", false],
    ["000000", false],
    ["#gggggg", false],
    ["red", false],
  ])("widget_configs.button_color %s is allowed: %s", async (color, ok) => {
    const update = db.query(`update public.widget_configs set button_color = $1`, [color]);
    if (ok) await expect(update).resolves.toBeDefined();
    else await expect(update).rejects.toThrow(/violates check constraint/);
  });

  it("checks project names are 1 to 60 characters and public keys are unique", async () => {
    const rename = (name: string) =>
      db.query(`update public.projects set name = $1 where id = $2`, [name, IDS[OWNER_A].project]);
    await expect(rename("")).rejects.toThrow(/violates check constraint/);
    await expect(rename("x".repeat(61))).rejects.toThrow(/violates check constraint/);
    await expect(rename("x".repeat(60))).resolves.toBeDefined();
    await expect(
      db.query(`update public.projects set public_key = 'pk_${OWNER_B}' where id = $1`, [
        IDS[OWNER_A].project,
      ]),
    ).rejects.toThrow(/duplicate key/);
  });
});

// What types.ts says about each column, derived by the compiler: a type error
// here means types.ts and this list disagree, and the test below checks this
// list against the migrated schema. So types.ts must match the schema.
type PublicTables = Database["public"]["Tables"];
type ColumnShape<T extends keyof PublicTables> = {
  [K in keyof PublicTables[T]["Row"]]-?: {
    nullable: null extends PublicTables[T]["Row"][K] ? true : false;
    insert: K extends keyof PublicTables[T]["Insert"]
      ? Record<string, never> extends Pick<PublicTables[T]["Insert"], K>
        ? "optional"
        : "required"
      : "missing";
  };
};
type TypesShape = { [T in keyof PublicTables]: ColumnShape<T> };

const req = { nullable: false, insert: "required" } as const;
const opt = { nullable: false, insert: "optional" } as const;
const TYPES_SHAPE: TypesShape = {
  accounts: { clerk_user_id: req, created_at: opt, plan: opt },
  projects: {
    id: opt,
    owner_id: req,
    name: req,
    public_key: req,
    messages_used: opt,
    period_start: opt,
    created_at: opt,
  },
  widget_configs: {
    project_id: req,
    button_color: opt,
    position: opt,
    label: opt,
    animation: opt,
    header_text: opt,
    show_badge: opt,
  },
  knowledge_sources: {
    id: opt,
    project_id: req,
    title: req,
    type: req,
    storage_key: { nullable: true, insert: "optional" },
    status: req,
    created_at: opt,
  },
  knowledge_chunks: { id: opt, project_id: req, source_id: req, content: req, embedding: req },
  conversations: { id: opt, project_id: req, visitor_id: req, created_at: opt },
  messages: { id: opt, conversation_id: req, role: req, body: req, created_at: opt },
};

describe("types.ts", () => {
  it("matches the migrated schema: tables, columns, nullability and insert defaults", async () => {
    const { rows } = await db.query<{
      table_name: string;
      column_name: string;
      is_nullable: "YES" | "NO";
      column_default: string | null;
    }>(
      `select table_name, column_name, is_nullable, column_default
       from information_schema.columns where table_schema = 'public'`,
    );
    const fromDb: Record<string, Record<string, { nullable: boolean; insert: string }>> = {};
    for (const row of rows) {
      const optional = row.is_nullable === "YES" || row.column_default !== null;
      (fromDb[row.table_name] ??= {})[row.column_name] = {
        nullable: row.is_nullable === "YES",
        insert: optional ? "optional" : "required",
      };
    }
    expect(fromDb).toEqual(TYPES_SHAPE);
  });

  it("lists exactly the public functions, each returning a set of IDs", async () => {
    const { rows } = await db.query<{ proname: string; args: string; returns: string }>(
      `select proname, pg_get_function_arguments(oid) as args,
              pg_get_function_result(oid) as returns
       from pg_proc where pronamespace = 'public'::regnamespace order by proname`,
    );
    const functions: Record<keyof Database["public"]["Functions"], true> = {
      owned_conversation_ids: true,
      owned_project_ids: true,
    };
    expect(rows.map((row) => row.proname)).toEqual(Object.keys(functions).sort());
    for (const row of rows) expect(row, row.proname).toMatchObject({ args: "", returns: "SETOF uuid" });
  });
});

describe("tenant isolation (authenticated)", () => {
  it.each(TABLES)("owner A sees only their own rows in %s, and owner B only theirs", async (table) => {
    expect(await keysAs(db, "authenticated", ownerClaims(OWNER_A), table)).toEqual([
      seededKey(OWNER_A, table),
    ]);
    expect(await keysAs(db, "authenticated", ownerClaims(OWNER_B), table)).toEqual([
      seededKey(OWNER_B, table),
    ]);
  });

  it.each(TABLES)("a token with an unknown or missing sub sees no rows in %s", async (table) => {
    expect(await keysAs(db, "authenticated", ownerClaims("user_nobody"), table)).toEqual([]);
    expect(await keysAs(db, "authenticated", {}, table)).toEqual([]);
  });

  it("owner A can't read owner B's rows by ID either", async () => {
    const rows = await asRole(db, "authenticated", ownerClaims(OWNER_A), async (tx) => {
      const projects = await tx.query(`select 1 from public.projects where id = $1`, [
        IDS[OWNER_B].project,
      ]);
      const messages = await tx.query(`select 1 from public.messages where conversation_id = $1`, [
        IDS[OWNER_B].conversation,
      ]);
      return [...projects.rows, ...messages.rows];
    });
    expect(rows).toEqual([]);
  });

  it("the helpers return only the caller's own IDs", async () => {
    const result = await asRole(db, "authenticated", ownerClaims(OWNER_A), async (tx) => {
      const projects = await tx.query<{ id: string }>(`select public.owned_project_ids() as id`);
      const conversations = await tx.query<{ id: string }>(
        `select public.owned_conversation_ids() as id`,
      );
      return { projects: projects.rows, conversations: conversations.rows };
    });
    expect(result).toEqual({
      projects: [{ id: IDS[OWNER_A].project }],
      conversations: [{ id: IDS[OWNER_A].conversation }],
    });
  });
});

describe("anon gets nothing", () => {
  it.each(TABLES)("anon is denied SELECT, INSERT, UPDATE and DELETE on %s", async (table) => {
    for (const sql of [
      `select * from public.${table}`,
      `insert into public.${table} default values`,
      `update public.${table} set ${KEY[table]} = ${KEY[table]}`,
      `delete from public.${table}`,
    ]) {
      expect(await errorAs(db, "anon", {}, sql)).toMatch(/permission denied for table/);
    }
  });

  it.each(HELPERS)("anon is denied EXECUTE on %s()", async (helper) => {
    expect(await errorAs(db, "anon", {}, `select public.${helper}()`)).toMatch(
      /permission denied for function/,
    );
  });

  it("anon holds no privilege on any table or function in public", async () => {
    const { rows } = await db.query<{ name: string }>(
      `select c.relname as name from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'S')
         and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
              or has_any_column_privilege('anon', c.oid, 'select,insert,update,references'))
       union all
       select p.proname from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and has_function_privilege('anon', p.oid, 'execute')`,
    );
    expect(rows).toEqual([]);
  });
});

describe("authenticated may only read, rename and delete", () => {
  it.each(TABLES)("authenticated can't INSERT into %s", async (table) => {
    expect(
      await errorAs(
        db,
        "authenticated",
        ownerClaims(OWNER_A),
        `insert into public.${table} default values`,
      ),
    ).toMatch(/permission denied for table/);
  });

  it("authenticated can't UPDATE any column except projects.name", async () => {
    const { rows } = await db.query<{ table_name: Table; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' order by table_name, ordinal_position`,
    );
    const updatable: string[] = [];
    for (const { table_name, column_name } of rows) {
      const sql = `update public.${table_name} set ${column_name} = ${column_name}`;
      try {
        await asRole(db, "authenticated", ownerClaims(OWNER_A), (tx) => tx.query(sql));
        updatable.push(`${table_name}.${column_name}`);
      } catch (error) {
        expect((error as Error).message).toMatch(/permission denied for table/);
      }
    }
    expect(updatable).toEqual(["projects.name"]);
  });

  it.each(TABLES.filter((table) => table !== "projects"))(
    "authenticated can't DELETE from %s",
    async (table) => {
      expect(
        await errorAs(db, "authenticated", ownerClaims(OWNER_A), `delete from public.${table}`),
      ).toMatch(/permission denied for table/);
    },
  );

  it("an owner can rename their own project but not another owner's", async () => {
    const renamed = await asRole(db, "authenticated", ownerClaims(OWNER_A), async (tx) => {
      const own = await tx.query(`update public.projects set name = 'Renamed' where id = $1`, [
        IDS[OWNER_A].project,
      ]);
      const other = await tx.query(`update public.projects set name = 'Hacked' where id = $1`, [
        IDS[OWNER_B].project,
      ]);
      return { own: own.affectedRows, other: other.affectedRows };
    });
    expect(renamed).toEqual({ own: 1, other: 0 });

    const { rows } = await db.query<{ id: string; name: string }>(
      `select id, name from public.projects order by id`,
    );
    expect(rows).toEqual([
      { id: IDS[OWNER_A].project, name: "Renamed" },
      { id: IDS[OWNER_B].project, name: `Project ${OWNER_B}` },
    ]);
  });

  it("an owner can't move their project to another owner", async () => {
    expect(
      await errorAs(
        db,
        "authenticated",
        ownerClaims(OWNER_A),
        `update public.projects set owner_id = '${OWNER_B}'`,
      ),
    ).toMatch(/permission denied for table/);
  });

  it("an owner can delete their own project but not another owner's", async () => {
    const deleted = await asRole(db, "authenticated", ownerClaims(OWNER_A), async (tx) => {
      const other = await tx.query(`delete from public.projects where id = $1`, [
        IDS[OWNER_B].project,
      ]);
      const own = await tx.query(`delete from public.projects where id = $1`, [
        IDS[OWNER_A].project,
      ]);
      return { own: own.affectedRows, other: other.affectedRows };
    });
    expect(deleted).toEqual({ own: 1, other: 0 });

    const { rows } = await db.query<{ id: string }>(`select id from public.projects`);
    expect(rows).toEqual([{ id: IDS[OWNER_B].project }]);
  });

  it("a token without a sub can't rename or delete any project", async () => {
    const affected = await asRole(db, "authenticated", {}, async (tx) => {
      const update = await tx.query(`update public.projects set name = 'Hacked'`);
      const remove = await tx.query(`delete from public.projects`);
      return [update.affectedRows, remove.affectedRows];
    });
    expect(affected).toEqual([0, 0]);
    expect(await count(db, "projects")).toBe(2);
  });
});

describe("cascades", () => {
  it("deleting a project deletes its config, sources, chunks, conversations and messages", async () => {
    await asRole(db, "authenticated", ownerClaims(OWNER_A), (tx) =>
      tx.query(`delete from public.projects where id = $1`, [IDS[OWNER_A].project]),
    );
    for (const table of PROJECT_SCOPED) {
      const { rows } = await db.query<{ key: string }>(
        `select ${KEY[table]}::text as key from public.${table}`,
      );
      expect(rows.map((row) => row.key), table).toEqual([seededKey(OWNER_B, table)]);
    }
    expect(await count(db, "accounts")).toBe(2);
  });

  it("deleting a knowledge source deletes its chunks", async () => {
    await asRole(db, "service_role", (tx) =>
      tx.query(`delete from public.knowledge_sources where id = $1`, [IDS[OWNER_A].source]),
    );
    const { rows } = await db.query<{ id: string }>(`select id from public.knowledge_chunks`);
    expect(rows).toEqual([{ id: IDS[OWNER_B].chunk }]);
  });

  it("a chunk's project must be its source's project", async () => {
    const insert = asRole(db, "service_role", (tx) =>
      tx.query(
        `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
         values ($1, $2, 'Leak', ${EMBEDDING})`,
        [IDS[OWNER_B].project, IDS[OWNER_A].source],
      ),
    );
    await expect(insert).rejects.toThrow(/knowledge_chunks_source_id_project_id_fkey/);
    await expect(
      asRole(db, "service_role", (tx) =>
        tx.query(`update public.knowledge_chunks set project_id = $1 where id = $2`, [
          IDS[OWNER_B].project,
          IDS[OWNER_A].chunk,
        ]),
      ),
    ).rejects.toThrow(/knowledge_chunks_source_id_project_id_fkey/);
    expect(await count(db, "knowledge_chunks")).toBe(2);
  });

  it("deleting an account deletes its projects and everything in them", async () => {
    await db.query(`delete from public.accounts where clerk_user_id = $1`, [OWNER_A]);
    for (const table of TABLES) expect(await count(db, table), table).toBe(1);
  });
});

describe("service_role", () => {
  it.each(TABLES)("service_role reads every row of %s (bypasses RLS)", async (table) => {
    expect(await keysAs(db, "service_role", {}, table)).toEqual(
      [seededKey(OWNER_A, table), seededKey(OWNER_B, table)].sort(),
    );
  });

  it("service_role can insert, update and delete", async () => {
    await asRole(db, "service_role", async (tx) => {
      await tx.query(`insert into public.accounts (clerk_user_id) values ('user_ccc')`);
      await tx.query(`update public.accounts set plan = 'pro' where clerk_user_id = 'user_ccc'`);
      await tx.query(`delete from public.accounts where clerk_user_id = 'user_ccc'`);
    });
    expect(await count(db, "accounts")).toBe(2);
  });

  it.each(HELPERS)("service_role can't execute %s() (authenticated only)", async (helper) => {
    expect(await errorAs(db, "service_role", {}, `select public.${helper}()`)).toMatch(
      /permission denied for function/,
    );
  });
});

describe("TRUNCATE", () => {
  it.each(TABLES)("is denied to anon, authenticated and service_role on %s", async (table) => {
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      expect(
        await errorAs(db, role, ownerClaims(OWNER_A), `truncate public.${table} cascade`),
        role,
      ).toMatch(/permission denied for table/);
    }
    expect(await count(db, table)).toBe(2);
  });
});

describe("functions", () => {
  it("every function in public has search_path = ''", async () => {
    const { rows } = await db.query<{ proname: string; proconfig: string[] | null }>(
      `select proname, proconfig from pg_proc
       where pronamespace = 'public'::regnamespace order by proname`,
    );
    expect(rows.map((row) => row.proname)).toEqual(["owned_conversation_ids", "owned_project_ids"]);
    for (const row of rows) expect(row.proconfig, row.proname).toEqual(['search_path=""']);
  });

  it("the helpers are SECURITY DEFINER and STABLE, and only authenticated may execute them", async () => {
    const { rows } = await db.query<{
      proname: string;
      prosecdef: boolean;
      provolatile: string;
      public_x: boolean;
      anon_x: boolean;
      authenticated_x: boolean;
    }>(
      `select proname, prosecdef, provolatile,
              exists (select 1 from aclexplode(proacl) where grantee = 0 and privilege_type = 'EXECUTE') as public_x,
              has_function_privilege('anon', oid, 'execute') as anon_x,
              has_function_privilege('authenticated', oid, 'execute') as authenticated_x
       from pg_proc where pronamespace = 'public'::regnamespace order by proname`,
    );
    for (const row of rows) {
      expect(row, row.proname).toMatchObject({
        prosecdef: true,
        provolatile: "s",
        public_x: false,
        anon_x: false,
        authenticated_x: true,
      });
    }
  });
});

describe("default privileges for future objects", () => {
  it("a new table, sequence or function in public gives anon and authenticated nothing", async () => {
    await db.exec(`
      create table public.future_probe (id bigint generated always as identity primary key);
      create function public.future_fn() returns int language sql as $$ select 1 $$;
    `);
    const { rows } = await db.query<{ role: string; table: boolean; seq: boolean; fn: boolean }>(
      `select r as role,
              has_table_privilege(r, 'public.future_probe', 'select,insert,update,delete,truncate') as table,
              has_sequence_privilege(r, 'public.future_probe_id_seq', 'usage,select,update') as seq,
              has_function_privilege(r, 'public.future_fn()', 'execute') as fn
       from unnest(array['anon', 'authenticated']) as r order by r`,
    );
    expect(rows).toEqual([
      { role: "anon", table: false, seq: false, fn: false },
      { role: "authenticated", table: false, seq: false, fn: false },
    ]);
  });
});
