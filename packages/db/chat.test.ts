// Tests for the chat migration (P3K-T05), on the pglite helper:
// consume_message() (quota, row lock, rolling-month reset), save_chat_turn()
// (creates then reuses a conversation, scoped to the project) and
// match_chunks() (one project, ready sources, threshold, HNSW). All three must
// be callable by service_role only.
import type { PGlite } from "@electric-sql/pglite";
import { EMBEDDING_DIMENSIONS, MATCH_COUNT, MIN_MATCH_SIMILARITY, PLAN_LIMITS } from "@askwell/shared";
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import type { Database } from "@askwell/db";
import { applyMigrations, asRole, createTestDb } from "@askwell/db/testing";
import type { Database as GeneratedDatabase } from "./types";

const OWNER = "user_owner";
const PROJECT = "00000000-0000-4000-8000-000000000001";
const OTHER_PROJECT = "00000000-0000-4000-8000-000000000002";
const MISSING = "00000000-0000-4000-8000-0000000000ff";
const VISITOR = "v".repeat(32);

const CONSUME_SIG = "public.consume_message(uuid, integer)";
const SAVE_SIG = "public.save_chat_turn(uuid, uuid, text, text, text)";
const MATCH_SIG = "public.match_chunks(uuid, extensions.vector, integer, double precision)";
const SIGS = [CONSUME_SIG, SAVE_SIG, MATCH_SIG] as const;

type ConsumeRow = { allowed: boolean; messages_used: number };
type MatchRow = { id: string; source_id: string; content: string; similarity: number };

// One migrated database with one owner and two projects. Each test leaves the
// projects' counters reset and no sources, chunks or conversations behind.
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
  await db.exec(`
    delete from public.knowledge_sources;
    delete from public.conversations;
    update public.projects set messages_used = 0, period_start = now();
  `);
});

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

// ---------------------------------------------------------------------------
// consume_message
// ---------------------------------------------------------------------------

function consume(max: number | null, project = PROJECT): Promise<ConsumeRow> {
  return asRole(db, "service_role", async (tx) => {
    const { rows } = await tx.query<ConsumeRow>("select * from public.consume_message($1, $2)", [
      project,
      max,
    ]);
    expect(rows).toHaveLength(1);
    return rows[0] as ConsumeRow;
  });
}

async function usage(project = PROJECT): Promise<{ messages_used: number; age_s: number }> {
  const { rows } = await db.query<{ messages_used: number; age_s: number }>(
    `select messages_used, extract(epoch from now() - period_start)::float8 as age_s
     from public.projects where id = $1`,
    [project],
  );
  return rows[0] as { messages_used: number; age_s: number };
}

describe("consume_message", () => {
  it("counts each message, then refuses at the limit without counting", async () => {
    const max = 3;
    expect(await consume(max)).toEqual({ allowed: true, messages_used: 1 });
    expect(await consume(max)).toEqual({ allowed: true, messages_used: 2 });
    expect(await consume(max)).toEqual({ allowed: true, messages_used: 3 });
    expect(await consume(max)).toEqual({ allowed: false, messages_used: 3 });
    expect(await consume(max)).toEqual({ allowed: false, messages_used: 3 });
    expect((await usage()).messages_used).toBe(3);
  });

  it("stops at the free plan's monthly limit", async () => {
    const max = PLAN_LIMITS.free.messagesPerMonth;
    await db.query("update public.projects set messages_used = $1 where id = $2", [max - 1, PROJECT]);
    expect(await consume(max)).toEqual({ allowed: true, messages_used: max });
    expect(await consume(max)).toEqual({ allowed: false, messages_used: max });
  });

  it("counts only this project", async () => {
    await consume(1, OTHER_PROJECT);
    expect(await consume(1)).toEqual({ allowed: true, messages_used: 1 });
    expect((await usage(OTHER_PROJECT)).messages_used).toBe(1);
  });

  it("two concurrent consumes at limit - 1: only one wins", async () => {
    const max = 5;
    await db.query("update public.projects set messages_used = $1 where id = $2", [max - 1, PROJECT]);

    const results = await Promise.all([consume(max), consume(max)]);
    expect(results.filter((r) => r.allowed)).toHaveLength(1);
    expect(results.filter((r) => !r.allowed)).toHaveLength(1);
    expect((await usage()).messages_used).toBe(max);
  });

  it("locks the project row before reading the count", async () => {
    // pglite has one connection, so the race above runs serially. This checks
    // the lock that makes it hold on a real, concurrent Postgres.
    const { rows } = await db.query<{ def: string }>(
      `select pg_get_functiondef('${CONSUME_SIG}'::regprocedure) as def`,
    );
    const def = (rows[0]?.def ?? "").replace(/\s+/g, " ");
    expect(def).toMatch(/from public\.projects p where p\.id = p_project_id for update/);
    expect(def.indexOf("for update")).toBeLessThan(def.indexOf("v_used < p_max_messages"));
  });

  it("starts a new period once period_start is a month or more ago", async () => {
    await db.query(
      `update public.projects
       set messages_used = 3, period_start = now() - interval '1 month' where id = $1`,
      [PROJECT],
    );
    expect(await consume(3)).toEqual({ allowed: true, messages_used: 1 });
    const after = await usage();
    expect(after.messages_used).toBe(1);
    expect(after.age_s).toBeLessThan(5);
  });

  it("resets even after several idle months", async () => {
    await db.query(
      `update public.projects
       set messages_used = 3, period_start = now() - interval '5 months' where id = $1`,
      [PROJECT],
    );
    expect(await consume(3)).toEqual({ allowed: true, messages_used: 1 });
  });

  it("keeps the period when it started less than a month ago", async () => {
    await db.query(
      `update public.projects
       set messages_used = 3, period_start = now() - interval '1 month' + interval '1 minute'
       where id = $1`,
      [PROJECT],
    );
    expect(await consume(3)).toEqual({ allowed: false, messages_used: 3 });
    expect((await usage()).age_s).toBeGreaterThan(27 * 24 * 3600);
  });

  it("raises project_not_found for an unknown project", async () => {
    expect(await raised(consume(3, MISSING))).toEqual({ code: "P0002", message: "project_not_found" });
  });

  it.each([null, -1])("raises invalid_max_messages for %s", async (max) => {
    expect(await raised(consume(max))).toEqual({ code: "22023", message: "invalid_max_messages" });
    expect((await usage()).messages_used).toBe(0);
  });

  it("a limit of 0 counts nothing", async () => {
    expect(await consume(0)).toEqual({ allowed: false, messages_used: 0 });
  });
});

// ---------------------------------------------------------------------------
// save_chat_turn
// ---------------------------------------------------------------------------

function save(
  conversation: string | null,
  message: string,
  reply: string,
  project = PROJECT,
): Promise<string> {
  return asRole(db, "service_role", async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "select public.save_chat_turn($1, $2, $3, $4, $5) as id",
      [project, conversation, VISITOR, message, reply],
    );
    return rows[0]?.id as string;
  });
}

async function messagesOf(conversation: string): Promise<{ role: string; body: string }[]> {
  const { rows } = await db.query<{ role: string; body: string }>(
    "select role, body from public.messages where conversation_id = $1 order by created_at, id",
    [conversation],
  );
  return rows;
}

async function countRows(table: "conversations" | "messages"): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`);
  return rows[0]?.n ?? -1;
}

describe("save_chat_turn", () => {
  it("creates a conversation on the first message, then reuses it", async () => {
    const id = await save(null, "Do you ship to Canada?", "Yes, in 5 days.");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const { rows } = await db.query("select project_id, visitor_id from public.conversations");
    expect(rows).toEqual([{ project_id: PROJECT, visitor_id: VISITOR }]);

    expect(await save(id, "And to Mexico?", "Not yet.")).toBe(id);
    expect(await countRows("conversations")).toBe(1);
    expect(await messagesOf(id)).toEqual([
      { role: "visitor", body: "Do you ship to Canada?" },
      { role: "bot", body: "Yes, in 5 days." },
      { role: "visitor", body: "And to Mexico?" },
      { role: "bot", body: "Not yet." },
    ]);
  });

  it("orders the reply after the visitor message within one call", async () => {
    const id = await save(null, "Q", "A");
    const { rows } = await db.query<{ ordered: boolean }>(
      `select (select created_at from public.messages where conversation_id = $1 and role = 'visitor')
            < (select created_at from public.messages where conversation_id = $1 and role = 'bot')
            as ordered`,
      [id],
    );
    expect(rows[0]?.ordered).toBe(true);
  });

  it("raises conversation_not_found for another project's conversation, saving nothing", async () => {
    const foreign = await save(null, "Hi", "Hello", OTHER_PROJECT);
    const before = await countRows("messages");

    expect(await raised(save(foreign, "Sneaky", "Leak"))).toEqual({
      code: "P0002",
      message: "conversation_not_found",
    });
    expect(await countRows("messages")).toBe(before);
    expect(await messagesOf(foreign)).toHaveLength(2);
  });

  it("raises conversation_not_found for an unknown conversation", async () => {
    expect(await raised(save(MISSING, "Hi", "Hello"))).toEqual({
      code: "P0002",
      message: "conversation_not_found",
    });
    expect(await countRows("conversations")).toBe(0);
  });

  it("fails on an unknown project without creating anything", async () => {
    expect((await raised(save(null, "Hi", "Hello", MISSING))).code).toBe("23503");
    expect(await countRows("conversations")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// match_chunks
// ---------------------------------------------------------------------------

/** A unit-length vector literal: cos(angle) on axis 0 and sin(angle) on axis 1. */
function vec(angleDeg: number): string {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const rad = (angleDeg * Math.PI) / 180;
  v[0] = Math.cos(rad);
  v[1] = Math.sin(rad);
  return `[${v.join(",")}]`;
}
/** Cosine similarity of vec(angle) to the query vec(0). */
const simAt = (angleDeg: number) => Math.cos((angleDeg * Math.PI) / 180);
const QUERY = vec(0);

let sourceN = 0;
/** A source with one chunk per angle; returns the source ID. */
async function sourceWith(
  status: string,
  chunks: { content: string; angle: number }[],
  project = PROJECT,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.knowledge_sources (project_id, title, type, status)
     values ($1, $2, 'text', $3) returning id`,
    [project, `Source ${++sourceN}`, status],
  );
  const id = rows[0]?.id as string;
  for (const chunk of chunks) {
    await db.query(
      `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
       values ($1, $2, $3, $4::extensions.vector)`,
      [project, id, chunk.content, vec(chunk.angle)],
    );
  }
  return id;
}

function match(
  count: number | null = MATCH_COUNT,
  min: number | null = MIN_MATCH_SIMILARITY,
  project = PROJECT,
  embedding = QUERY,
): Promise<MatchRow[]> {
  return asRole(db, "service_role", async (tx) => {
    const { rows } = await tx.query<MatchRow>(
      "select * from public.match_chunks($1, $2::extensions.vector, $3, $4)",
      [project, embedding, count, min],
    );
    return rows;
  });
}

describe("match_chunks", () => {
  it("returns this project's ready chunks above the threshold, nearest first", async () => {
    const source = await sourceWith("ready", [
      { content: "far", angle: 80 }, // similarity ~0.17: below MIN_MATCH_SIMILARITY
      { content: "near", angle: 10 },
      { content: "nearest", angle: 0 },
      { content: "mid", angle: 45 },
    ]);

    const rows = await match();
    expect(rows.map((r) => r.content)).toEqual(["nearest", "near", "mid"]);
    expect(rows.every((r) => r.source_id === source)).toBe(true);
    expect(rows[0]?.similarity).toBeCloseTo(1, 5);
    expect(rows[1]?.similarity).toBeCloseTo(simAt(10), 5);
    expect(rows[2]?.similarity).toBeCloseTo(simAt(45), 5);
    expect(rows.every((r) => r.similarity >= MIN_MATCH_SIMILARITY)).toBe(true);
  });

  it("returns at most p_count rows", async () => {
    await sourceWith(
      "ready",
      Array.from({ length: 8 }, (_, i) => ({ content: `c${i}`, angle: i * 5 })),
    );
    const rows = await match(MATCH_COUNT);
    expect(rows).toHaveLength(MATCH_COUNT);
    expect(rows.map((r) => r.content)).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  });

  it("never returns another project's chunks, even identical, closer ones", async () => {
    await sourceWith("ready", [{ content: "theirs", angle: 0 }], OTHER_PROJECT);
    await sourceWith("ready", [{ content: "ours", angle: 30 }]);

    expect((await match()).map((r) => r.content)).toEqual(["ours"]);
    expect((await match(MATCH_COUNT, MIN_MATCH_SIMILARITY, OTHER_PROJECT)).map((r) => r.content)).toEqual([
      "theirs",
    ]);
  });

  it.each(["uploading", "processing", "failed"])("skips chunks of %s sources", async (status) => {
    await sourceWith(status, [{ content: "not ready", angle: 0 }]);
    await sourceWith("ready", [{ content: "ready", angle: 20 }]);
    expect((await match()).map((r) => r.content)).toEqual(["ready"]);
  });

  it("returns nothing when no chunk passes the threshold", async () => {
    await sourceWith("ready", [{ content: "unrelated", angle: 85 }]);
    expect(await match()).toEqual([]);
  });

  it("returns nothing for a project without knowledge", async () => {
    await sourceWith("ready", [{ content: "theirs", angle: 0 }], OTHER_PROJECT);
    expect(await match()).toEqual([]);
  });

  it.each([null, 0, 51])("raises invalid_match_count for %s", async (count) => {
    expect(await raised(match(count))).toEqual({ code: "22023", message: "invalid_match_count" });
  });

  it("can use the HNSW index for its query", async () => {
    // The function's query, run directly so EXPLAIN can see it. On a few rows
    // the planner rightly prefers the project_id index + an exact sort; with
    // seq scans and sorts off it must show it can read chunks in distance
    // order from the HNSW index, which it does at scale.
    await sourceWith("ready", [{ content: "a", angle: 0 }]);
    const plan = await db.transaction(async (tx) => {
      await tx.exec("set local enable_seqscan = off; set local enable_sort = off");
      await tx.exec("set local search_path = ''");
      const { rows } = await tx.query<{ "QUERY PLAN": string }>(
        `explain select c.id
         from public.knowledge_chunks c
         join public.knowledge_sources s on s.id = c.source_id and s.project_id = c.project_id
         where c.project_id = $1 and s.status = 'ready'
           and c.embedding operator(extensions.<=>) $2::extensions.vector <= 1 - $3::float8
         order by c.embedding operator(extensions.<=>) $2::extensions.vector
         limit $4`,
        [PROJECT, QUERY, MIN_MATCH_SIMILARITY, MATCH_COUNT],
      );
      return rows.map((r) => r["QUERY PLAN"]).join("\n");
    });
    expect(plan).toMatch(/Index Scan using knowledge_chunks_embedding_idx/);
    expect(plan).toMatch(/Index Scan using knowledge_chunks_embedding_idx on knowledge_chunks c[^\n]*\n\s*Order By:/);

    // And the function runs exactly that shape.
    const { rows } = await db.query<{ def: string }>(
      `select pg_get_functiondef('${MATCH_SIG}'::regprocedure) as def`,
    );
    const def = (rows[0]?.def ?? "").replace(/\s+/g, " ");
    expect(def).toMatch(/order by c\.embedding operator\(extensions\.<=>\) p_embedding limit p_count/);
  });
});

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

describe("chat function access", () => {
  it.each([
    ["anon", {}],
    ["authenticated", { sub: OWNER }],
  ] as const)("%s gets permission denied on all three, and nothing changes", async (role, claims) => {
    await sourceWith("ready", [{ content: "secret", angle: 0 }]);

    const calls: [string, Promise<unknown>][] = [
      [
        "consume_message",
        asRole(db, role, claims, (tx) => tx.query("select public.consume_message($1, $2)", [PROJECT, 100])),
      ],
      [
        "save_chat_turn",
        asRole(db, role, claims, (tx) =>
          tx.query("select public.save_chat_turn($1, $2, $3, $4, $5)", [PROJECT, null, VISITOR, "m", "r"]),
        ),
      ],
      [
        "match_chunks",
        asRole(db, role, claims, (tx) =>
          tx.query("select * from public.match_chunks($1, $2::extensions.vector, $3, $4)", [
            PROJECT,
            QUERY,
            5,
            0,
          ]),
        ),
      ],
    ];
    for (const [name, call] of calls) {
      expect((await raised(call)).message).toMatch(new RegExp(`permission denied for function ${name}`));
    }
    expect((await usage()).messages_used).toBe(0);
    expect(await countRows("conversations")).toBe(0);
  });

  it.each(SIGS)("only service_role holds EXECUTE on %s", async (sig) => {
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
    [CONSUME_SIG, ['search_path=""']],
    [SAVE_SIG, ['search_path=""']],
    [MATCH_SIG, ['search_path=""', "hnsw.iterative_scan=strict_order"]],
  ])("%s is SECURITY INVOKER plpgsql with %j", async (sig, config) => {
    const { rows } = await db.query<{ prosecdef: boolean; lang: string; proconfig: string[] | null }>(
      `select p.prosecdef, l.lanname as lang, p.proconfig
       from pg_proc p join pg_language l on l.oid = p.prolang
       where p.oid = '${sig}'::regprocedure`,
    );
    expect(rows).toEqual([{ prosecdef: false, lang: "plpgsql", proconfig: config }]);
  });
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

describe("Database type override (index.ts)", () => {
  type Functions = Database["public"]["Functions"];
  type Generated = GeneratedDatabase["public"]["Functions"];

  it("save_chat_turn takes a null conversation ID; everything else as generated", () => {
    type Save = Functions["save_chat_turn"];
    expectTypeOf<Save["Args"]["p_conversation_id"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Omit<Save["Args"], "p_conversation_id">>().toEqualTypeOf<
      Omit<Generated["save_chat_turn"]["Args"], "p_conversation_id">
    >();
    expectTypeOf<Save["Returns"]>().toEqualTypeOf<string>();
  });

  it("consume_message and match_chunks are as generated", () => {
    expectTypeOf<Functions["consume_message"]>().toEqualTypeOf<Generated["consume_message"]>();
    expectTypeOf<Functions["match_chunks"]>().toEqualTypeOf<Generated["match_chunks"]>();
    expectTypeOf<Functions["consume_message"]["Returns"][number]>().toEqualTypeOf<{
      allowed: boolean;
      messages_used: number;
    }>();
  });
});
