// SB-T11's chat functions from supabase/migrations, on pglite with Supabase's roles, auth.jwt()
// and default privileges recreated (supabase-pglite.ts). Matches today's lib/chat and
// packages/db/queries/chunks.ts behavior, now as service_role-only rpc() functions.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { actAs, actAsServiceRole, createSupabaseTestDb } from "./supabase-pglite";

const OWNER = "user_owner";
const PROJECT = "00000000-0000-4000-8000-00000000000a";
const OTHER_PROJECT = "00000000-0000-4000-8000-00000000000b";

const MISSING_PROJECT = "00000000-0000-4000-8000-0000000000ff";

const VECTOR_1536 = (seed: number) => `[${Array(1536).fill(seed).join(",")}]`;

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

async function seedProject(db: PGlite, projectId: string, publicKey: string, overrides: { periodStart?: string } = {}) {
  await db.query("INSERT INTO accounts (clerk_user_id) VALUES ($1) ON CONFLICT DO NOTHING", [OWNER]);
  await db.query(
    `INSERT INTO projects (id, owner_id, name, public_key, period_start)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))`,
    [projectId, OWNER, "Docs bot", publicKey, overrides.periodStart ?? null],
  );
}

describe.each([
  { autoExposeNewTables: true, label: "auto-exposed tables" },
  { autoExposeNewTables: false, label: "opt-in exposure" },
])("SB-T11 chat functions ($label)", ({ autoExposeNewTables }) => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createSupabaseTestDb({ autoExposeNewTables });
  });
  beforeEach(async () => {
    await db.exec("BEGIN");
  });
  afterEach(async () => {
    await db.exec("ROLLBACK");
  });
  afterAll(async () => {
    await db.close();
  });

  describe("add_one_month", () => {
    async function addOneMonth(iso: string): Promise<string> {
      await actAsServiceRole(db);
      const { rows } = await db.query<{ add_one_month: string }>("SELECT add_one_month($1::timestamptz) AS add_one_month", [
        iso,
      ]);
      return new Date(rows[0]!.add_one_month).toISOString();
    }

    it("clamps to the shorter month's last day instead of overflowing, as JS's addOneMonth does", async () => {
      expect(await addOneMonth("2026-01-31T10:00:00.000Z")).toBe("2026-02-28T10:00:00.000Z");
    });

    it("clamps to Feb 29 in a leap year", async () => {
      expect(await addOneMonth("2028-01-31T10:00:00.000Z")).toBe("2028-02-29T10:00:00.000Z");
    });

    it("keeps the same day when the next month is long enough", async () => {
      expect(await addOneMonth("2026-03-15T08:30:00.000Z")).toBe("2026-04-15T08:30:00.000Z");
    });

    it("rolls over the year", async () => {
      expect(await addOneMonth("2026-12-10T00:00:00.000Z")).toBe("2027-01-10T00:00:00.000Z");
    });
  });

  describe("consume_message", () => {
    it("counts while under the limit", async () => {
      await seedProject(db, PROJECT, "pk_a");
      await actAsServiceRole(db);
      const { rows } = await db.query<{ consume_message: boolean }>(
        "SELECT consume_message($1, 3) AS consume_message",
        [PROJECT],
      );
      expect(rows[0]!.consume_message).toBe(true);
      const [row] = (await db.query<{ messages_used: number }>("SELECT messages_used FROM projects WHERE id = $1", [PROJECT])).rows;
      expect(row!.messages_used).toBe(1);
    });

    it("refuses at the limit, without incrementing further", async () => {
      await seedProject(db, PROJECT, "pk_a");
      await actAsServiceRole(db);
      await db.query("UPDATE projects SET messages_used = 3 WHERE id = $1", [PROJECT]);
      const { rows } = await db.query<{ consume_message: boolean }>(
        "SELECT consume_message($1, 3) AS consume_message",
        [PROJECT],
      );
      expect(rows[0]!.consume_message).toBe(false);
      const [row] = (await db.query<{ messages_used: number }>("SELECT messages_used FROM projects WHERE id = $1", [PROJECT])).rows;
      expect(row!.messages_used).toBe(3);
    });

    it("refuses over the limit", async () => {
      await seedProject(db, PROJECT, "pk_a");
      await actAsServiceRole(db);
      await db.query("UPDATE projects SET messages_used = 5 WHERE id = $1", [PROJECT]);
      const { rows } = await db.query<{ consume_message: boolean }>(
        "SELECT consume_message($1, 3) AS consume_message",
        [PROJECT],
      );
      expect(rows[0]!.consume_message).toBe(false);
    });

    it("resets the period, and counts, once the old one is a month old", async () => {
      // 40 days ago is always more than one calendar month back (no month exceeds 31 days), so
      // add_one_month(period_start) is reliably in the past regardless of today's date. The
      // clamping math itself (Jan 31 -> Feb 28, etc.) is covered by the add_one_month tests above.
      const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).toISOString();
      await seedProject(db, PROJECT, "pk_a", { periodStart: past });
      await actAsServiceRole(db);
      await db.query("UPDATE projects SET messages_used = 5 WHERE id = $1", [PROJECT]);

      const { rows } = await db.query<{ consume_message: boolean }>(
        "SELECT consume_message($1, 3) AS consume_message",
        [PROJECT],
      );
      expect(rows[0]!.consume_message).toBe(true);
      const [row] = (await db.query<{ messages_used: number; period_start: Date }>(
        "SELECT messages_used, period_start FROM projects WHERE id = $1",
        [PROJECT],
      )).rows;
      expect(row!.messages_used).toBe(1);
      expect(row!.period_start.getTime()).toBeGreaterThan(new Date(past).getTime());
    });

    it("does not reset a period that isn't a month old yet", async () => {
      const recentStart = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(); // 5 days ago
      await seedProject(db, PROJECT, "pk_a", { periodStart: recentStart });
      await actAsServiceRole(db);
      await db.query("UPDATE projects SET messages_used = 2 WHERE id = $1", [PROJECT]);
      await db.query("SELECT consume_message($1, 3)", [PROJECT]);
      const [row] = (await db.query<{ messages_used: number; period_start: Date }>(
        "SELECT messages_used, period_start FROM projects WHERE id = $1",
        [PROJECT],
      )).rows;
      expect(row!.messages_used).toBe(3);
      expect(row!.period_start.toISOString()).toBe(recentStart);
    });

    it("refuses a project that doesn't exist with AWNOP", async () => {
      await actAsServiceRole(db);
      const error = await refused(db, "SELECT consume_message($1, 3)", [MISSING_PROJECT]);
      expect(error.code).toBe("AWNOP");
    });

    it("rejects a null or negative limit with 22023", async () => {
      await seedProject(db, PROJECT, "pk_a");
      await actAsServiceRole(db);
      for (const limit of [null, -1]) {
        const error = await refused(db, "SELECT consume_message($1, $2)", [PROJECT, limit]);
        expect(error.code).toBe("22023");
      }
    });
  });

  describe("save_chat_turn", () => {
    it("creates the first conversation for a project, with first_chat true", async () => {
      await seedProject(db, PROJECT, "pk_a");
      await actAsServiceRole(db);
      const { rows } = await db.query<{ conversation_id: string; first_chat: boolean }>(
        `SELECT * FROM save_chat_turn($1, NULL, 'visitor-1', 'Hi?', 'Hello.', now(), now())`,
        [PROJECT],
      );
      expect(rows[0]!.first_chat).toBe(true);
      expect(rows[0]!.conversation_id).toBeTruthy();

      const messages = (await db.query<{ role: string; body: string }>(
        "SELECT role, body FROM messages WHERE conversation_id = $1 ORDER BY created_at",
        [rows[0]!.conversation_id],
      )).rows;
      expect(messages).toEqual([
        { role: "visitor", body: "Hi?" },
        { role: "bot", body: "Hello." },
      ]);
    });

    it("sets first_chat true only once for a project", async () => {
      await seedProject(db, PROJECT, "pk_a");
      await actAsServiceRole(db);
      const first = await db.query<{ first_chat: boolean }>(
        `SELECT first_chat FROM save_chat_turn($1, NULL, 'visitor-1', 'q1', 'r1', now(), now())`,
        [PROJECT],
      );
      const second = await db.query<{ first_chat: boolean }>(
        `SELECT first_chat FROM save_chat_turn($1, NULL, 'visitor-2', 'q2', 'r2', now(), now())`,
        [PROJECT],
      );
      expect(first.rows[0]!.first_chat).toBe(true);
      expect(second.rows[0]!.first_chat).toBe(false);
    });

    it("appends to an existing conversation of the same project", async () => {
      await seedProject(db, PROJECT, "pk_a");
      await actAsServiceRole(db);
      const created = await db.query<{ conversation_id: string }>(
        `SELECT conversation_id FROM save_chat_turn($1, NULL, 'visitor-1', 'q1', 'r1', now(), now())`,
        [PROJECT],
      );
      const conversationId = created.rows[0]!.conversation_id;
      const again = await db.query<{ conversation_id: string; first_chat: boolean }>(
        `SELECT * FROM save_chat_turn($1, $2, 'visitor-1', 'q2', 'r2', now(), now())`,
        [PROJECT, conversationId],
      );
      expect(again.rows[0]!.conversation_id).toBe(conversationId);
      expect(again.rows[0]!.first_chat).toBe(false);
      const count = await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1",
        [conversationId],
      );
      expect(count.rows[0]!.n).toBe(4);
    });

    it("refuses a conversation_id from another project with AWNOC, like today's 404", async () => {
      await seedProject(db, PROJECT, "pk_a");
      await seedProject(db, OTHER_PROJECT, "pk_b");
      await actAsServiceRole(db);
      const foreign = await db.query<{ conversation_id: string }>(
        `SELECT conversation_id FROM save_chat_turn($1, NULL, 'visitor-1', 'q', 'r', now(), now())`,
        [OTHER_PROJECT],
      );
      const error = await refused(
        db,
        `SELECT * FROM save_chat_turn($1, $2, 'visitor-1', 'q', 'r', now(), now())`,
        [PROJECT, foreign.rows[0]!.conversation_id],
      );
      expect(error.code).toBe("AWNOC");
    });

    it("refuses a conversation_id that doesn't exist at all with AWNOC", async () => {
      await seedProject(db, PROJECT, "pk_a");
      await actAsServiceRole(db);
      const error = await refused(
        db,
        `SELECT * FROM save_chat_turn($1, $2, 'visitor-1', 'q', 'r', now(), now())`,
        [PROJECT, MISSING_PROJECT],
      );
      expect(error.code).toBe("AWNOC");
    });

    it("refuses a project that doesn't exist with AWNOP", async () => {
      await actAsServiceRole(db);
      const error = await refused(
        db,
        `SELECT * FROM save_chat_turn($1, NULL, 'visitor-1', 'q', 'r', now(), now())`,
        [MISSING_PROJECT],
      );
      expect(error.code).toBe("AWNOP");
    });
  });

  describe("match_chunks", () => {
    async function seedChunk(
      projectId: string,
      status: "processing" | "ready" | "failed",
      content: string,
      seed: number,
    ) {
      const source = await db.query<{ id: string }>(
        "INSERT INTO knowledge_sources (project_id, title, type, status) VALUES ($1, 'Doc', 'text', $2) RETURNING id",
        [projectId, status],
      );
      await db.query(
        `INSERT INTO knowledge_chunks (project_id, source_id, content, embedding)
         VALUES ($1, $2, $3, $4::extensions.vector)`,
        [projectId, source.rows[0]!.id, content, VECTOR_1536(seed)],
      );
    }

    it("returns only this project's ready chunks, nearest first", async () => {
      await seedProject(db, PROJECT, "pk_a");
      await seedProject(db, OTHER_PROJECT, "pk_b");
      await actAsServiceRole(db);
      await seedChunk(PROJECT, "ready", "near", 1);
      await seedChunk(PROJECT, "ready", "far", 5);
      await seedChunk(PROJECT, "processing", "not ready yet", 1);
      await seedChunk(PROJECT, "failed", "failed ingest", 1);
      await seedChunk(OTHER_PROJECT, "ready", "other project, closer than anything above", 1);

      const { rows } = await db.query<{ content: string; distance: number }>(
        "SELECT * FROM match_chunks($1, $2::extensions.vector, 5)",
        [PROJECT, VECTOR_1536(1)],
      );
      expect(rows.map((r) => r.content)).toEqual(["near", "far"]);
      expect(rows[0]!.distance).toBeLessThanOrEqual(rows[1]!.distance);
    });

    it("caps results at match_count", async () => {
      await seedProject(db, PROJECT, "pk_a");
      await actAsServiceRole(db);
      await seedChunk(PROJECT, "ready", "a", 1);
      await seedChunk(PROJECT, "ready", "b", 2);
      await seedChunk(PROJECT, "ready", "c", 3);
      const { rows } = await db.query("SELECT * FROM match_chunks($1, $2::extensions.vector, 2)", [
        PROJECT,
        VECTOR_1536(1),
      ]);
      expect(rows).toHaveLength(2);
    });
  });

  describe("privileges", () => {
    it("denies anon and authenticated; allows service_role", async () => {
      await seedProject(db, PROJECT, "pk_a");

      const calls = [
        () => db.query("SELECT add_one_month(now())"),
        () => db.query("SELECT consume_message($1, 3)", [PROJECT]),
        () => db.query(`SELECT * FROM save_chat_turn($1, NULL, 'v', 'q', 'r', now(), now())`, [PROJECT]),
        () => db.query("SELECT * FROM match_chunks($1, $2::extensions.vector, 5)", [PROJECT, VECTOR_1536(1)]),
      ];

      for (const act of [() => actAs(db, null), () => actAs(db, OWNER)]) {
        for (const call of calls) {
          await db.query("SAVEPOINT s");
          await act();
          await expect(call()).rejects.toThrow(/permission denied/);
          await db.query("ROLLBACK TO SAVEPOINT s");
        }
      }

      await actAsServiceRole(db);
      await expect(db.query("SELECT add_one_month(now())")).resolves.toBeTruthy();
      await expect(db.query("SELECT consume_message($1, 3)", [PROJECT])).resolves.toBeTruthy();
    });
  });
});
