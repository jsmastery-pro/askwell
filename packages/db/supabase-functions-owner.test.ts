// SB-T03's limit functions from supabase/migrations, on pglite with Supabase's roles and default
// privileges recreated (supabase-pglite.ts). Each test seeds in one transaction, calls as an API
// role, and rolls back. pglite has one connection, so the row locks are exercised by sequential
// calls; the concurrent case is checked on dev after merge.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { actAs, actAsServiceRole, createSupabaseTestDb } from "./supabase-pglite";

const A = "user_a";
const B = "user_b";
const PROJECT_A = "00000000-0000-4000-8000-00000000000a";
const PROJECT_B = "00000000-0000-4000-8000-00000000000b";
const MISSING_PROJECT = "00000000-0000-4000-8000-0000000000ff";
const SOURCE_ID = "00000000-0000-4000-8000-000000000501";

const CREATE_PROJECT = "SELECT * FROM public.create_project($1, $2, $3, $4)";
const RESERVE_SOURCE = "SELECT * FROM public.reserve_knowledge_source($1, $2, $3, $4, $5)";
const RESERVE_SOURCE_WITH_ID = "SELECT * FROM public.reserve_knowledge_source($1, $2, $3, $4, $5, $6)";

type ProjectRow = { id: string; owner_id: string; name: string; public_key: string; messages_used: number };
type SourceRow = { id: string; project_id: string; title: string; type: string; storage_key: string | null; status: string };

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
  }
}

async function count(db: PGlite, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`, params);
  return rows[0]!.n;
}

/** Runs a call that must fail, inside a savepoint so the test's transaction carries on. */
async function refused(db: PGlite, sql: string, params: unknown[]): Promise<{ code?: string; detail?: string }> {
  await db.exec("SAVEPOINT refused");
  try {
    await db.query(sql, params);
  } catch (error) {
    return error as { code?: string; detail?: string };
  } finally {
    await db.exec("ROLLBACK TO SAVEPOINT refused");
  }
  throw new Error(`expected the call to be refused: ${sql}`);
}

// Both Data API defaults: existing projects auto-grant EXECUTE on new functions to the API roles,
// new projects don't. The migration revokes and grants explicitly, so both must hold.
describe.each([
  { autoExposeNewTables: true, label: "auto-exposed" },
  { autoExposeNewTables: false, label: "opt-in exposure" },
])("Supabase limit functions ($label)", ({ autoExposeNewTables }) => {
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

  describe("create_project", () => {
    it("creates the project and its default widget config", async () => {
      await actAsServiceRole(db);
      const { rows } = await db.query<ProjectRow>(CREATE_PROJECT, [A, "Second", "pk_second", 5]);
      expect(rows).toEqual([expect.objectContaining({ owner_id: A, name: "Second", public_key: "pk_second", messages_used: 0 })]);
      const { rows: configs } = await db.query("SELECT position, animation, show_badge, label FROM widget_configs WHERE project_id = $1", [
        rows[0]!.id,
      ]);
      expect(configs).toEqual([{ position: "bottom-right", animation: "fade", show_badge: true, label: null }]);
    });

    it("creates the account when an API call comes before the dashboard", async () => {
      await actAsServiceRole(db);
      await db.query(CREATE_PROJECT, ["user_new", "First", "pk_new", 1]);
      expect(await count(db, "accounts WHERE clerk_user_id = 'user_new' AND plan = 'free'")).toBe(1);
    });

    it("refuses at the limit with AWLIM, inserting nothing", async () => {
      await actAsServiceRole(db);
      const error = await refused(db, CREATE_PROJECT, [A, "Second", "pk_second", 1]);
      expect(error).toMatchObject({ code: "AWLIM", detail: "1" });
      expect(await count(db, "projects WHERE owner_id = $1", [A])).toBe(1);
      expect(await count(db, "widget_configs")).toBe(0);
    });

    it("counts each owner's projects separately", async () => {
      await actAsServiceRole(db);
      await db.query(CREATE_PROJECT, [B, "B's second", "pk_b2", 2]);
      expect((await refused(db, CREATE_PROJECT, [B, "B's third", "pk_b3", 2])).code).toBe("AWLIM");
      expect(await count(db, "projects WHERE owner_id = $1", [A])).toBe(1);
      expect(await count(db, "projects WHERE owner_id = $1", [B])).toBe(2);
    });

    it("lets sequential calls fill the limit exactly, then refuses", async () => {
      await actAsServiceRole(db);
      await db.query(CREATE_PROJECT, ["user_c", "1", "pk_c1", 3]);
      await db.query(CREATE_PROJECT, ["user_c", "2", "pk_c2", 3]);
      await db.query(CREATE_PROJECT, ["user_c", "3", "pk_c3", 3]);
      expect((await refused(db, CREATE_PROJECT, ["user_c", "4", "pk_c4", 3])).code).toBe("AWLIM");
      expect(await count(db, "projects WHERE owner_id = 'user_c'")).toBe(3);
    });

    it("leaves no account behind when it refuses a new owner", async () => {
      await actAsServiceRole(db);
      expect((await refused(db, CREATE_PROJECT, ["user_zero", "x", "pk_zero", 0])).code).toBe("AWLIM");
      expect(await count(db, "accounts WHERE clerk_user_id = 'user_zero'")).toBe(0);
    });

    it("rejects a null or negative limit with 22023", async () => {
      await actAsServiceRole(db);
      for (const limit of [null, -1]) {
        expect((await refused(db, CREATE_PROJECT, [A, "x", "pk_x", limit])).code).toBe("22023");
      }
      expect(await count(db, "projects")).toBe(2);
    });
  });

  describe("reserve_knowledge_source", () => {
    // SB-T06: a file reservation starts `uploading` — the browser hasn't PUT the object yet —
    // and only becomes `processing` once finalize atomically claims it (below). Pasted text has
    // no upload step, so it starts `processing` directly.
    it("inserts a file reservation as uploading, with the server's ID and storage key", async () => {
      await actAsServiceRole(db);
      const key = `projects/${PROJECT_A}/${SOURCE_ID}`;
      const { rows } = await db.query<SourceRow>(RESERVE_SOURCE_WITH_ID, [PROJECT_A, "Guide", "pdf", key, 3, SOURCE_ID]);
      expect(rows).toEqual([
        expect.objectContaining({ id: SOURCE_ID, project_id: PROJECT_A, title: "Guide", type: "pdf", storage_key: key, status: "uploading" }),
      ]);
    });

    it("inserts a pasted-text reservation as processing, generating the ID", async () => {
      await actAsServiceRole(db);
      const { rows } = await db.query<SourceRow>(RESERVE_SOURCE, [PROJECT_A, "FAQ", "text", null, 3]);
      expect(rows[0]).toMatchObject({ project_id: PROJECT_A, type: "text", storage_key: null, status: "processing" });
      expect(rows[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("counts files and pasted text together, whatever their status, and refuses at the limit", async () => {
      await db.query(
        `INSERT INTO knowledge_sources (project_id, title, type, storage_key, status)
         VALUES ($1, 'a', 'text', NULL, 'ready'), ($1, 'b', 'pdf', 'projects/a/b', 'failed')`,
        [PROJECT_A],
      );
      await actAsServiceRole(db);
      await db.query(RESERVE_SOURCE, [PROJECT_A, "c", "md", "projects/a/c", 3]);
      const error = await refused(db, RESERVE_SOURCE, [PROJECT_A, "d", "text", null, 3]);
      expect(error).toMatchObject({ code: "AWLIM", detail: "3" });
      expect(await count(db, "knowledge_sources WHERE project_id = $1", [PROJECT_A])).toBe(3);
    });

    it("counts each project's sources separately", async () => {
      await actAsServiceRole(db);
      await db.query(RESERVE_SOURCE, [PROJECT_B, "b", "text", null, 1]);
      await db.query(RESERVE_SOURCE, [PROJECT_A, "a", "text", null, 1]);
      expect(await count(db, "knowledge_sources")).toBe(2);
    });

    it("refuses a project that doesn't exist with AWNOP, inserting nothing", async () => {
      await actAsServiceRole(db);
      expect((await refused(db, RESERVE_SOURCE, [MISSING_PROJECT, "x", "text", null, 3])).code).toBe("AWNOP");
      expect(await count(db, "knowledge_sources")).toBe(0);
    });

    it("rejects a null or negative limit with 22023", async () => {
      await actAsServiceRole(db);
      for (const limit of [null, -1]) {
        expect((await refused(db, RESERVE_SOURCE, [PROJECT_A, "x", "text", null, limit])).code).toBe("22023");
      }
      expect(await count(db, "knowledge_sources")).toBe(0);
    });
  });

  // SB-T06 review (MUST FIX): finalize claims a source with this exact conditional UPDATE, so two
  // calls for the same source — concurrent or retried — can't both start ingest and double the
  // OpenAI bill. Not a function; the route runs it directly through the service client, so these
  // tests exercise the SQL itself rather than an RPC.
  describe("finalize's atomic claim (uploading -> processing, once)", () => {
    const CLAIM = `UPDATE knowledge_sources SET status = 'processing'
                   WHERE id = $1 AND project_id = $2 AND status = 'uploading'
                   RETURNING *`;

    it("claims an uploading file reservation exactly once; a second finalize finds nothing to claim", async () => {
      await actAsServiceRole(db);
      const key = `projects/${PROJECT_A}/${SOURCE_ID}`;
      await db.query(RESERVE_SOURCE_WITH_ID, [PROJECT_A, "Guide", "pdf", key, 3, SOURCE_ID]);

      const first = await db.query<SourceRow>(CLAIM, [SOURCE_ID, PROJECT_A]);
      expect(first.rows).toEqual([expect.objectContaining({ id: SOURCE_ID, status: "processing" })]);

      const second = await db.query<SourceRow>(CLAIM, [SOURCE_ID, PROJECT_A]);
      expect(second.rows).toEqual([]);
    });

    it("never claims a pasted-text reservation (it's already processing, not uploading)", async () => {
      await actAsServiceRole(db);
      const { rows } = await db.query<SourceRow>(RESERVE_SOURCE, [PROJECT_A, "FAQ", "text", null, 3]);
      const { rows: claimed } = await db.query<SourceRow>(CLAIM, [rows[0]!.id, PROJECT_A]);
      expect(claimed).toEqual([]);
    });
  });

  describe("who can execute", () => {
    // An owner's own token can't call them: they could pass any limit they like.
    it.each([
      { who: "anon", user: null },
      { who: "authenticated (the owner's token)", user: A },
    ])("refuses $who", async ({ user }) => {
      for (const [sql, params] of [
        [CREATE_PROJECT, [A, "x", "pk_x", 100]],
        [RESERVE_SOURCE, [PROJECT_A, "x", "text", null, 100]],
      ] as const) {
        await db.exec("SAVEPOINT role");
        await actAs(db, user);
        const error = await refused(db, sql, [...params]);
        expect(error.code, sql).toBe("42501");
        await db.exec("ROLLBACK TO SAVEPOINT role");
      }
      expect(await count(db, "projects")).toBe(2);
      expect(await count(db, "knowledge_sources")).toBe(0);
    });

    it("lets service_role call both", async () => {
      await actAsServiceRole(db);
      await expect(db.query(CREATE_PROJECT, [A, "x", "pk_x", 5])).resolves.toMatchObject({ rows: [expect.anything()] });
      await expect(db.query(RESERVE_SOURCE, [PROJECT_A, "x", "text", null, 5])).resolves.toMatchObject({
        rows: [expect.anything()],
      });
    });

    it("grants EXECUTE to service_role only, PUBLIC included", async () => {
      const { rows } = await db.query<{ fn: string; anon: boolean; authenticated: boolean; service_role: boolean; public: boolean }>(
        `SELECT p.proname AS fn,
                has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
                has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role,
                EXISTS (
                  SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
                ) AS public
         FROM pg_proc p WHERE p.proname IN ('create_project', 'reserve_knowledge_source') ORDER BY p.proname`,
      );
      expect(rows).toEqual([
        { fn: "create_project", anon: false, authenticated: false, service_role: true, public: false },
        { fn: "reserve_knowledge_source", anon: false, authenticated: false, service_role: true, public: false },
      ]);
    });

    it("runs as the invoker with a pinned search_path", async () => {
      const { rows } = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>(
        "SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname IN ('create_project', 'reserve_knowledge_source') ORDER BY proname",
      );
      expect(rows).toEqual([
        { proname: "create_project", prosecdef: false, proconfig: ['search_path=""'] },
        { proname: "reserve_knowledge_source", prosecdef: false, proconfig: ['search_path=""'] },
      ]);
    });
  });
});

// SB-T06: the bucket itself isn't affected by the Data API exposure setting, so this runs once
// against its own database rather than inside the describe.each above.
describe("knowledge bucket (SB-T06)", () => {
  it("is private, with a 10 MB limit and exactly the three allowed MIME types", async () => {
    const db = await createSupabaseTestDb();
    try {
      const { rows } = await db.query<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
        "SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'knowledge'",
      );
      expect(rows).toEqual([
        { public: false, file_size_limit: 10485760, allowed_mime_types: ["application/pdf", "text/markdown", "text/plain"] },
      ]);
    } finally {
      await db.close();
    }
  });
});
