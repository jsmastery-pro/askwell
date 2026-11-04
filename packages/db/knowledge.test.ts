// Tests for the knowledge migration (P3K-T02), on the pglite helper: the
// private "knowledge" bucket, reserve_knowledge_source() (plan limit, row
// lock, 2-hour reclaim) and claim_knowledge_source() (claims once). Both
// functions must be callable by service_role only.
import type { PGlite } from "@electric-sql/pglite";
import { ALLOWED_FILE_MIME_TYPES, MAX_KNOWLEDGE_FILE_BYTES, PLAN_LIMITS } from "@askwell/shared";
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import type { Database } from "@askwell/db";
import { applyMigrations, asRole, createTestDb } from "@askwell/db/testing";
import type { Database as GeneratedDatabase } from "./types";

const OWNER = "user_owner";
const PROJECT = "00000000-0000-4000-8000-000000000001";
const OTHER_PROJECT = "00000000-0000-4000-8000-000000000002";

const RESERVE_SIG = "public.reserve_knowledge_source(uuid, text, text, text, text, integer)";
const CLAIM_SIG = "public.claim_knowledge_source(uuid, uuid)";

type SourceRow = {
  id: string;
  project_id: string;
  title: string;
  type: string;
  storage_key: string | null;
  status: string;
  created_at: string;
};
type ReserveRow = SourceRow & { reclaimed_storage_keys: string[] };

// One migrated database with one owner and two projects, emptied of sources
// after each test. A single pglite instance per file keeps memory low.
let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await applyMigrations(db);
  await db.exec(`
    insert into public.accounts (clerk_user_id) values ('${OWNER}');
    insert into public.projects (id, owner_id, name, public_key) values
      ('${PROJECT}', '${OWNER}', 'Docs bot', 'pk_docs'),
      ('${OTHER_PROJECT}', '${OWNER}', 'Other bot', 'pk_other');
  `);
});

afterAll(async () => {
  await db.close();
});

afterEach(async () => {
  await db.exec("delete from public.knowledge_sources");
});

/** Reserves a file source as service_role, the way the upload-url route does. */
function reserveFile(key: string, max: number, project = PROJECT): Promise<ReserveRow> {
  return reserve(project, `File ${key}`, "pdf", key, "uploading", max);
}

/** Reserves a pasted text as service_role, the way the text route does. */
function reserveText(max: number, project = PROJECT): Promise<ReserveRow> {
  return reserve(project, "Pasted", "text", null, "processing", max);
}

function reserve(
  project: string,
  title: string,
  type: string,
  key: string | null,
  status: string,
  max: number | null,
): Promise<ReserveRow> {
  return asRole(db, "service_role", async (tx) => {
    const { rows } = await tx.query<ReserveRow>(
      "select * from public.reserve_knowledge_source($1, $2, $3, $4, $5, $6)",
      [project, title, type, key, status, max],
    );
    expect(rows).toHaveLength(1);
    return rows[0] as ReserveRow;
  });
}

function claim(source: string, project = PROJECT): Promise<SourceRow[]> {
  return asRole(db, "service_role", async (tx) => {
    const { rows } = await tx.query<SourceRow>(
      "select * from public.claim_knowledge_source($1, $2)",
      [source, project],
    );
    return rows;
  });
}

/** The SQLSTATE and message a call raised. */
async function raised(promise: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    const { code, message } = error as { code?: string; message: string };
    return { code, message };
  }
  throw new Error("Expected the call to raise");
}

async function countSources(project = PROJECT): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    "select count(*)::int as n from public.knowledge_sources where project_id = $1",
    [project],
  );
  return rows[0]?.n ?? -1;
}

/** Inserts a source as postgres with a given age, to test the 2-hour reclaim. */
async function insertAged(key: string | null, status: string, age: string): Promise<void> {
  await db.query(
    `insert into public.knowledge_sources (project_id, title, type, storage_key, status, created_at)
     values ($1, 'Aged', $2, $3, $4, now() - $5::interval)`,
    [PROJECT, key === null ? "text" : "pdf", key, status, age],
  );
}

describe("knowledge bucket", () => {
  it("is private, 10 MB, and allows exactly ALLOWED_FILE_MIME_TYPES", async () => {
    const { rows } = await db.query<{
      id: string;
      name: string;
      public: boolean;
      file_size_limit: string;
      allowed_mime_types: string[];
    }>("select id, name, public, file_size_limit::text, allowed_mime_types from storage.buckets");
    expect(rows).toHaveLength(1);
    const bucket = rows[0];
    expect(bucket).toMatchObject({ id: "knowledge", name: "knowledge", public: false });
    expect(Number(bucket?.file_size_limit)).toBe(MAX_KNOWLEDGE_FILE_BYTES);
    expect([...(bucket?.allowed_mime_types ?? [])].sort()).toEqual([...ALLOWED_FILE_MIME_TYPES].sort());
  });
});

describe("reserve_knowledge_source", () => {
  it("reserves a file as uploading and returns the row with no reclaimed keys", async () => {
    const row = await reserveFile("proj/a.pdf", 3);
    expect(row).toMatchObject({
      project_id: PROJECT,
      title: "File proj/a.pdf",
      type: "pdf",
      storage_key: "proj/a.pdf",
      status: "uploading",
      reclaimed_storage_keys: [],
    });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reserves pasted text as processing with a null storage key", async () => {
    await expect(reserveText(3)).resolves.toMatchObject({
      type: "text",
      storage_key: null,
      status: "processing",
    });
  });

  it.each([
    ["Free", PLAN_LIMITS.free.knowledgeSources],
    ["Pro", PLAN_LIMITS.pro.knowledgeSources],
  ])("allows exactly the %s limit (%i), then raises plan_limit_reached and writes nothing", async (_plan, max) => {
    // Files and pasted texts count toward the same limit.
    for (let i = 0; i < max; i++) {
      if (i % 2) await reserveText(max);
      else await reserveFile(`proj/${i}.pdf`, max);
    }
    expect(await countSources()).toBe(max);

    expect(await raised(reserveFile("proj/extra.pdf", max))).toEqual({
      code: "P0001",
      message: "plan_limit_reached",
    });
    expect(await raised(reserveText(max))).toEqual({ code: "P0001", message: "plan_limit_reached" });
    expect(await countSources()).toBe(max);
  });

  it("free limit is 3 and passes under the Pro limit of 25", async () => {
    expect(PLAN_LIMITS.free.knowledgeSources).toBe(3);
    expect(PLAN_LIMITS.pro.knowledgeSources).toBe(25);
    for (let i = 0; i < 3; i++) await reserveFile(`proj/${i}.pdf`, PLAN_LIMITS.free.knowledgeSources);
    expect((await raised(reserveText(PLAN_LIMITS.free.knowledgeSources))).message).toBe("plan_limit_reached");
    await expect(reserveText(PLAN_LIMITS.pro.knowledgeSources)).resolves.toMatchObject({ status: "processing" });
  });

  it("counts only this project's sources", async () => {
    await reserveFile("other/a.pdf", 1, OTHER_PROJECT);
    await expect(reserveFile("proj/a.pdf", 1)).resolves.toMatchObject({ project_id: PROJECT });
  });

  it("two concurrent reserves at limit - 1: only one wins", async () => {
    const max = PLAN_LIMITS.free.knowledgeSources;
    for (let i = 0; i < max - 1; i++) await reserveFile(`proj/${i}.pdf`, max);

    const results = await Promise.allSettled([
      reserveFile("proj/race-a.pdf", max),
      reserveFile("proj/race-b.pdf", max),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0]?.reason as Error).message).toBe("plan_limit_reached");
    expect(await countSources()).toBe(max);
  });

  it("locks the project row before counting", async () => {
    // pglite has one connection, so the race above runs serially. This checks
    // the lock that makes it hold on a real, concurrent Postgres.
    const { rows } = await db.query<{ def: string }>(
      `select pg_get_functiondef('${RESERVE_SIG}'::regprocedure) as def`,
    );
    const def = (rows[0]?.def ?? "").replace(/\s+/g, " ");
    expect(def).toMatch(/from public\.projects p where p\.id = p_project_id for update/);
    expect(def.indexOf("for update")).toBeLessThan(def.indexOf("count(*)"));
  });

  it("reclaims uploading reservations older than 2 hours and returns their keys", async () => {
    const max = PLAN_LIMITS.free.knowledgeSources;
    await insertAged("proj/stale-1.pdf", "uploading", "2 hours 1 minute");
    await insertAged("proj/stale-2.pdf", "uploading", "3 days");
    await insertAged("proj/fresh.pdf", "uploading", "1 hour 59 minutes");
    expect(await countSources()).toBe(max);

    const row = await reserveFile("proj/new.pdf", max);
    expect([...row.reclaimed_storage_keys].sort()).toEqual(["proj/stale-1.pdf", "proj/stale-2.pdf"]);

    const { rows } = await db.query<{ storage_key: string }>(
      "select storage_key from public.knowledge_sources order by storage_key",
    );
    expect(rows.map((r) => r.storage_key)).toEqual(["proj/fresh.pdf", "proj/new.pdf"]);
  });

  it("never reclaims old sources that are processing, ready or failed, or other projects' reservations", async () => {
    await insertAged(null, "processing", "1 day");
    await insertAged("proj/ready.pdf", "ready", "1 day");
    await insertAged("proj/failed.pdf", "failed", "1 day");
    await db.query(
      `insert into public.knowledge_sources (project_id, title, type, storage_key, status, created_at)
       values ($1, 'Theirs', 'pdf', 'other/stale.pdf', 'uploading', now() - interval '1 day')`,
      [OTHER_PROJECT],
    );

    expect(await raised(reserveFile("proj/new.pdf", 3))).toEqual({ code: "P0001", message: "plan_limit_reached" });
    expect(await countSources()).toBe(3);
    expect(await countSources(OTHER_PROJECT)).toBe(1);
  });

  it("keeps the reclaimed rows when the limit is still hit (the whole call rolls back)", async () => {
    await insertAged("proj/stale.pdf", "uploading", "1 day");
    await insertAged("proj/fresh.pdf", "uploading", "1 minute");
    expect((await raised(reserveFile("proj/new.pdf", 1))).message).toBe("plan_limit_reached");
    expect(await countSources()).toBe(2);
  });

  it("raises project_not_found for an unknown project, and writes nothing", async () => {
    expect(await raised(reserveFile("x.pdf", 3, "00000000-0000-4000-8000-0000000000ff"))).toEqual({
      code: "P0002",
      message: "project_not_found",
    });
  });

  it.each([
    ["null", null],
    ["negative", -1],
  ])("raises invalid_max_sources for a %s limit", async (_label, max) => {
    expect(await raised(reserve(PROJECT, "T", "pdf", "k.pdf", "uploading", max))).toEqual({
      code: "22023",
      message: "invalid_max_sources",
    });
  });

  it.each([
    ["text with a storage key", "text", "k.txt", "processing"],
    ["text as uploading", "text", null, "uploading"],
    ["file without a storage key", "pdf", null, "uploading"],
    ["file as processing", "pdf", "k.pdf", "processing"],
    ["any source as ready", "md", "k.md", "ready"],
  ])("raises invalid_source for %s", async (_label, type, key, status) => {
    expect(await raised(reserve(PROJECT, "T", type, key, status, 3))).toEqual({
      code: "22023",
      message: "invalid_source",
    });
    expect(await countSources()).toBe(0);
  });

  it("leaves the type check to the table", async () => {
    const error = await raised(reserve(PROJECT, "T", "docx", "k.docx", "uploading", 3));
    expect(error.code).toBe("23514");
    expect(error.message).toContain("knowledge_sources_type_check");
  });
});

describe("claim_knowledge_source", () => {
  it("moves an uploading source to processing once; a second call returns no row", async () => {
    const source = await reserveFile("proj/a.pdf", 3);

    const first = await claim(source.id);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ id: source.id, status: "processing", storage_key: "proj/a.pdf" });

    expect(await claim(source.id)).toEqual([]);
  });

  it("returns no row for another project's source, and leaves it uploading", async () => {
    const source = await reserveFile("proj/a.pdf", 3);
    expect(await claim(source.id, OTHER_PROJECT)).toEqual([]);
    const { rows } = await db.query<{ status: string }>(
      "select status from public.knowledge_sources where id = $1",
      [source.id],
    );
    expect(rows).toEqual([{ status: "uploading" }]);
  });

  it("returns no row for pasted text or an unknown id", async () => {
    const text = await reserveText(3);
    expect(await claim(text.id)).toEqual([]);
    expect(await claim("00000000-0000-4000-8000-0000000000ff")).toEqual([]);
  });
});

describe("knowledge function access", () => {
  it.each([
    ["anon", {}],
    ["authenticated", { sub: OWNER }],
  ] as const)("%s gets permission denied on both, and nothing changes", async (role, claims) => {
    const source = await reserveFile("proj/a.pdf", 3);

    const reserveCall = asRole(db, role, claims, (tx) =>
      tx.query("select public.reserve_knowledge_source($1, $2, $3, $4, $5, $6)", [
        PROJECT,
        "Sneaky",
        "text",
        null,
        "processing",
        25,
      ]),
    );
    expect((await raised(reserveCall)).message).toMatch(/permission denied for function reserve_knowledge_source/);

    const claimCall = asRole(db, role, claims, (tx) =>
      tx.query("select public.claim_knowledge_source($1, $2)", [source.id, PROJECT]),
    );
    expect((await raised(claimCall)).message).toMatch(/permission denied for function claim_knowledge_source/);

    expect(await countSources()).toBe(1);
    const { rows } = await db.query<{ status: string }>("select status from public.knowledge_sources");
    expect(rows).toEqual([{ status: "uploading" }]);
  });

  it.each([RESERVE_SIG, CLAIM_SIG])("only service_role holds EXECUTE on %s", async (sig) => {
    const { rows } = await db.query<{ role: string; can: boolean }>(
      `select r as role, has_function_privilege(r, '${sig}', 'execute') as can
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
         where p.oid = '${sig}'::regprocedure
           and a.grantee = 0 and a.privilege_type = 'EXECUTE'
       ) as public_x`,
    );
    expect(acl.rows[0]?.public_x).toBe(false);
  });

  it.each([
    [RESERVE_SIG, "plpgsql"],
    [CLAIM_SIG, "sql"],
  ])("%s is SECURITY INVOKER (%s) with search_path = ''", async (sig, lang) => {
    const { rows } = await db.query<{ prosecdef: boolean; lang: string; proconfig: string[] | null }>(
      `select p.prosecdef, l.lanname as lang, p.proconfig
       from pg_proc p join pg_language l on l.oid = p.prolang
       where p.oid = '${sig}'::regprocedure`,
    );
    expect(rows).toEqual([{ prosecdef: false, lang, proconfig: ['search_path=""'] }]);
  });
});

describe("Database type override (index.ts)", () => {
  type Functions = Database["public"]["Functions"];
  type Generated = GeneratedDatabase["public"]["Functions"];
  type Reserve = Functions["reserve_knowledge_source"];

  it("reserve_knowledge_source takes and returns a nullable storage key (pasted text)", () => {
    expectTypeOf<Reserve["Args"]["p_storage_key"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Reserve["Returns"][number]["storage_key"]>().toEqualTypeOf<string | null>();
  });

  it("keeps every other field of reserve_knowledge_source as generated", () => {
    expectTypeOf<Omit<Reserve["Args"], "p_storage_key">>().toEqualTypeOf<
      Omit<Generated["reserve_knowledge_source"]["Args"], "p_storage_key">
    >();
    expectTypeOf<Omit<Reserve["Returns"][number], "storage_key">>().toEqualTypeOf<
      Omit<Generated["reserve_knowledge_source"]["Returns"][number], "storage_key">
    >();
  });

  it("leaves the other functions, the tables and the other schema keys unchanged", () => {
    expectTypeOf<Omit<Functions, "reserve_knowledge_source" | "save_chat_turn">>().toEqualTypeOf<
      Omit<Generated, "reserve_knowledge_source" | "save_chat_turn">
    >();
    expectTypeOf<Database["public"]["Tables"]>().toEqualTypeOf<GeneratedDatabase["public"]["Tables"]>();
    expectTypeOf<keyof Database>().toEqualTypeOf<keyof GeneratedDatabase>();
  });
});
