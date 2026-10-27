// owner_activity() from supabase/migrations, on pglite with Supabase's roles and default
// privileges recreated (supabase-pglite.ts). Each test seeds two owners in one transaction, calls
// as an API role, and rolls back.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { actAs, actAsServiceRole, createSupabaseTestDb } from "./supabase-pglite";

const A = "user_a";
const B = "user_b";
const ACTIVITY = "SELECT * FROM public.owner_activity($1, $2)";
const START = "2026-10-01T00:00:00Z";
const END = "2026-10-31T23:59:59Z";

type Activity = { messages: number; conversations: number; visitors: number; daily: Record<string, number> };

/**
 * A: two conversations (visitors v1, v2) with messages on Oct 3 and Oct 4, plus one in September.
 * B: one conversation with three messages on Oct 3, which A must never count.
 */
async function seed(db: PGlite) {
  for (const owner of [A, B]) {
    await db.query("INSERT INTO accounts (clerk_user_id) VALUES ($1)", [owner]);
    await db.query("INSERT INTO projects (owner_id, name, public_key) VALUES ($1, 'p', $2)", [owner, `pk_${owner}`]);
  }
  const conversation = async (owner: string, visitor: string) =>
    (
      await db.query<{ id: string }>(
        `INSERT INTO conversations (project_id, visitor_id)
         SELECT id, $2 FROM projects WHERE owner_id = $1 RETURNING id`,
        [owner, visitor],
      )
    ).rows[0]!.id;
  const message = (conversationId: string, at: string) =>
    db.query("INSERT INTO messages (conversation_id, role, body, created_at) VALUES ($1, 'visitor', 'hi', $2)", [
      conversationId,
      at,
    ]);

  const a1 = await conversation(A, "v1");
  const a2 = await conversation(A, "v2");
  await message(a1, "2026-10-03T08:00:00Z");
  await message(a1, "2026-10-03T23:30:00Z");
  await message(a2, "2026-10-04T00:15:00Z");
  await message(a2, "2026-09-30T12:00:00Z");
  const b1 = await conversation(B, "v9");
  for (let i = 0; i < 3; i++) await message(b1, "2026-10-03T10:00:00Z");
}

async function activity(db: PGlite, start: string | null, end: string | null): Promise<Activity> {
  const { rows } = await db.query<Activity>(ACTIVITY, [start, end]);
  return rows[0]!;
}

/** Runs a call that must fail, inside a savepoint so the test's transaction carries on. */
async function refused(db: PGlite, params: unknown[]): Promise<{ code?: string }> {
  await db.exec("SAVEPOINT refused");
  try {
    await db.query(ACTIVITY, params);
  } catch (error) {
    return error as { code?: string };
  } finally {
    await db.exec("ROLLBACK TO SAVEPOINT refused");
  }
  throw new Error("expected owner_activity to be refused");
}

describe.each([
  { autoExposeNewTables: true, label: "auto-exposed" },
  { autoExposeNewTables: false, label: "opt-in exposure" },
])("owner_activity ($label)", ({ autoExposeNewTables }) => {
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

  it("counts only the caller's own messages, conversations and visitors, by UTC day", async () => {
    await actAs(db, A);
    expect(await activity(db, START, END)).toEqual({
      messages: 3,
      conversations: 2,
      visitors: 2,
      daily: { "2026-10-03": 2, "2026-10-04": 1 },
    });
  });

  it("never counts another owner's rows", async () => {
    await actAs(db, B);
    expect(await activity(db, START, END)).toEqual({ messages: 3, conversations: 1, visitors: 1, daily: { "2026-10-03": 3 } });
  });

  it("includes both bounds and nothing outside them", async () => {
    await actAs(db, A);
    expect(await activity(db, "2026-10-03T23:30:00Z", "2026-10-04T00:15:00Z")).toMatchObject({ messages: 2, conversations: 2 });
    expect(await activity(db, "2026-09-01T00:00:00Z", "2026-09-30T23:59:59Z")).toMatchObject({
      messages: 1,
      daily: { "2026-09-30": 1 },
    });
  });

  it("returns zeros and an empty daily map with no messages", async () => {
    await actAs(db, "user_without_projects");
    expect(await activity(db, START, END)).toEqual({ messages: 0, conversations: 0, visitors: 0, daily: {} });
  });

  it("rejects a reversed, missing or over-366-day range with 22023", async () => {
    await actAs(db, A);
    for (const range of [
      [END, START],
      [null, END],
      [START, null],
      ["2025-01-01T00:00:00Z", "2026-01-03T00:00:00Z"],
    ]) {
      expect((await refused(db, range)).code, range.join(" → ")).toBe("22023");
    }
    // Exactly 366 days is allowed.
    await expect(db.query(ACTIVITY, ["2025-01-01T00:00:00Z", "2026-01-02T00:00:00Z"])).resolves.toBeDefined();
  });

  it("can't be executed by anon or service_role", async () => {
    for (const as of [() => actAs(db, null), () => actAsServiceRole(db)]) {
      await db.exec("SAVEPOINT role");
      await as();
      expect((await refused(db, [START, END])).code).toBe("42501");
      await db.exec("ROLLBACK TO SAVEPOINT role");
    }
  });

  it("is SECURITY INVOKER with a pinned search_path, executable by authenticated only", async () => {
    const { rows } = await db.query(
      `SELECT prosecdef, proconfig,
              has_function_privilege('anon', oid, 'EXECUTE') AS anon,
              has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated,
              has_function_privilege('service_role', oid, 'EXECUTE') AS service_role,
              EXISTS (
                SELECT 1 FROM aclexplode(coalesce(proacl, acldefault('f', proowner))) a
                WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
              ) AS public
       FROM pg_proc WHERE proname = 'owner_activity'`,
    );
    expect(rows).toEqual([
      { prosecdef: false, proconfig: ['search_path=""'], anon: false, authenticated: true, service_role: false, public: false },
    ]);
  });
});
