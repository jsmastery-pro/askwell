// @vitest-environment node
import { createSupabaseTestDb } from "@askwell/db/supabase-pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "../../../../../../lib/supabase/fake";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ userId: null as string | null, owner: undefined as unknown }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));
// Ownership (lib/projects) reads through the owner client (RLS); which rows RLS lets an owner see
// is tested against the real migrations on pglite (packages/db), so here another owner's project
// is simply a row the fake doesn't return.
vi.mock("../../../../../../lib/supabase/owner", () => ({ createOwnerClient: () => state.owner }));

const embedTexts = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/ai", () => ({ embedTexts }));

const captureServerEvent = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/posthog/server", () => ({ captureServerEvent }));

const readKnowledgeFile = vi.hoisted(() => vi.fn());
const deleteKnowledgeFile = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/storage", () => ({ readKnowledgeFile, deleteKnowledgeFile }));

// A spy on deleteKnowledgeSource that calls through to the real implementation by default lets one
// test (refuse's delete-failure path) make it throw without touching the others, which rely on it
// really deleting the row.
const deleteKnowledgeSource = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/knowledge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../../lib/knowledge")>();
  return { ...actual, deleteKnowledgeSource };
});
const actualDeleteKnowledgeSource = (
  await vi.importActual<typeof import("../../../../../../lib/knowledge")>("../../../../../../lib/knowledge")
).deleteKnowledgeSource;

// The service client is faked over a pglite db with the real Supabase migrations, which this
// file's own SQL asserts read: the route's claim (uploading → processing), its fallback lookup and
// its revert (processing → uploading) run as the same filtered UPDATE/SELECT on the real row, as
// do the status updates, row delete and chunk inserts that follow (processKnowledgeSource,
// deleteKnowledgeSource, SB-T07). So a status transition the route makes is one the asserts see.
type SourceRow = { id: string; title: string; type: string; storage_key: string | null; status: string; created_at: Date };

const SOURCE_FILTER_COLUMNS = ["id", "project_id", "status"];

/** A knowledge_sources query filtered by .eq() calls: `sql` gets the WHERE clause, `params` come first. */
function sourcesQuery(sql: (where: string) => string, params: unknown[]) {
  const filters: [string, unknown][] = [];
  const run = async () => {
    const where = filters.map(([column], i) => `${column} = $${params.length + i + 1}`).join(" AND ");
    const { rows } = await db.query<SourceRow>(sql(where), [...params, ...filters.map(([, value]) => value)]);
    return rows;
  };
  // As PostgREST returns it: timestamps as ISO strings.
  const first = async () => {
    const [row] = await run();
    return { data: row ? { ...row, created_at: row.created_at.toISOString() } : null, error: null };
  };
  const query = {
    eq(column: string, value: unknown) {
      if (!SOURCE_FILTER_COLUMNS.includes(column)) throw new Error(`unexpected filter ${column}`);
      filters.push([column, value]);
      return query;
    },
    select: () => ({ maybeSingle: first }),
    maybeSingle: first,
    // Awaited without .select(): a plain update, like the real builder's { error }.
    then: (resolve: (result: { error: null }) => void, reject: (error: unknown) => void) =>
      run().then(() => resolve({ error: null }), reject),
  };
  return query;
}

function from(table: string) {
  if (table === "knowledge_chunks") {
    return {
      // The real client sends embeddings as pgvector's text form (JSON.stringify'd), which is
      // what the vector cast reads here too.
      insert: async (rows: { project_id: string; source_id: string; content: string; embedding: string }[]) => {
        await db.query(
          `INSERT INTO public.knowledge_chunks (project_id, source_id, content, embedding)
           SELECT r.project_id, r.source_id, r.content, r.embedding::extensions.vector
           FROM jsonb_to_recordset($1::jsonb) AS r(project_id uuid, source_id uuid, content text, embedding text)`,
          [JSON.stringify(rows)],
        );
        return { error: null };
      },
    };
  }
  if (table !== "knowledge_sources") throw new Error(`unexpected table ${table}`);
  return {
    update: (values: { status: "processing" | "uploading" | "ready" | "failed" }) =>
      sourcesQuery((where) => `UPDATE public.knowledge_sources SET status = $1 WHERE ${where} RETURNING *`, [values.status]),
    select: () => sourcesQuery((where) => `SELECT * FROM public.knowledge_sources WHERE ${where}`, []),
    delete: () => ({
      eq: async (_column: string, id: string) => {
        await db.query("DELETE FROM public.knowledge_sources WHERE id = $1", [id]);
        return { error: null };
      },
    }),
  };
}
vi.mock("../../../../../../lib/supabase/service", () => ({ createServiceClient: () => ({ from }) }));

const { POST } = await import("./route");

const samplePdf = readFileSync(fileURLToPath(new URL("../../../../../../lib/knowledge/fixtures/sample.pdf", import.meta.url)));

let db: Awaited<ReturnType<typeof createSupabaseTestDb>>;

beforeAll(async () => {
  db = await createSupabaseTestDb();
});

afterAll(() => db.close());

beforeEach(() => {
  state.userId = null;
  state.owner = undefined;
  captureServerEvent.mockClear();
  readKnowledgeFile.mockReset();
  deleteKnowledgeFile.mockReset();
  deleteKnowledgeFile.mockResolvedValue(undefined);
  embedTexts.mockReset();
  embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => Array(1536).fill(0.1)));
  deleteKnowledgeSource.mockReset();
  deleteKnowledgeSource.mockImplementation(actualDeleteKnowledgeSource);
});

/** Signs in `userId`, with an owner client that sees `projectId` as theirs (null: another owner's). */
function signIn(userId: string, projectId: string | null) {
  state.userId = userId;
  state.owner = fakeSupabase({ from: { projects: { data: projectId && { id: projectId } } } });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedProject(ownerId: string, publicKey: string) {
  await db.query("INSERT INTO public.accounts (clerk_user_id, plan) VALUES ($1, 'free') ON CONFLICT DO NOTHING", [ownerId]);
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO public.projects (owner_id, name, public_key) VALUES ($1, 'Docs', $2) RETURNING id",
    [ownerId, publicKey],
  );
  return rows[0]!.id;
}

async function seedSource(
  projectId: string,
  overrides: { title?: string; type?: string; storage_key?: string | null; status?: string } = {},
) {
  const { title = "doc.pdf", type = "pdf", storage_key = "projects/p/s", status = "uploading" } = overrides;
  const { rows } = await db.query<SourceRow>(
    `INSERT INTO public.knowledge_sources (project_id, title, type, storage_key, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [projectId, title, type, storage_key, status],
  );
  return rows[0]!;
}

async function sourceRows(id: string) {
  const { rows } = await db.query<SourceRow>("SELECT * FROM public.knowledge_sources WHERE id = $1", [id]);
  return rows;
}

function request(sourceId: string) {
  return new Request("https://app.test/api/projects/x/knowledge/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId }),
  });
}

describe("unauthenticated", () => {
  it("returns 401", async () => {
    const res = await POST(request("00000000-0000-4000-8000-000000000001"), ctx("any"));
    expect(res.status).toBe(401);
  });
});

describe("tenant isolation", () => {
  it("returns 404 for another owner's project", async () => {
    const projectId = await seedProject("owner_a", "pk_a1");
    const source = await seedSource(projectId);
    signIn("owner_b", null);
    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(404);
  });
});

describe("not found", () => {
  it("returns 404 for an unknown source id", async () => {
    const projectId = await seedProject("owner_unknown", "pk_unknown");
    signIn("owner_unknown", projectId);
    const res = await POST(request("00000000-0000-4000-8000-0000000000ff"), ctx(projectId));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the source belongs to a different project", async () => {
    const projectId = await seedProject("owner_mismatch", "pk_mismatch");
    const otherProjectId = await seedProject("owner_mismatch2", "pk_mismatch2");
    const source = await seedSource(otherProjectId);
    signIn("owner_mismatch", projectId);
    // Not claimable (wrong project), and the fallback lookup is scoped to this project too, so it
    // finds nothing — same as an unknown id.
    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(404);
  });

  it("returns 404 for a pasted-text source (no file to finalize)", async () => {
    const projectId = await seedProject("owner_text", "pk_text");
    const source = await seedSource(projectId, { type: "text", storage_key: null, status: "processing" });
    signIn("owner_text", projectId);
    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(404);
  });
});

describe("already finalized", () => {
  it("rejects finalizing a source that isn't `uploading` any more", async () => {
    const projectId = await seedProject("owner_done", "pk_done");
    const source = await seedSource(projectId, { status: "ready" });
    signIn("owner_done", projectId);
    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(400);
  });
});

describe("success", () => {
  it("accepts a real PDF, starts processing, and fires knowledge_added", async () => {
    const projectId = await seedProject("owner_ok", "pk_ok");
    const source = await seedSource(projectId, { title: "handbook.pdf" });
    signIn("owner_ok", projectId);
    readKnowledgeFile.mockResolvedValue(samplePdf);

    const res = await POST(request(source.id), ctx(projectId));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.source).toMatchObject({ id: source.id, title: "handbook.pdf", type: "pdf" });
    expect(captureServerEvent).toHaveBeenCalledExactlyOnceWith("owner_ok", "knowledge_added", {
      project_id: projectId,
      type: "pdf",
    });

    await vi.waitFor(async () => {
      const [row] = await sourceRows(source.id);
      expect(row?.status).toBe("ready");
    });
    const { rows: chunks } = await db.query("SELECT 1 FROM public.knowledge_chunks WHERE source_id = $1", [source.id]);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("accepts a plain text file (md/txt skip the PDF magic-byte check)", async () => {
    const projectId = await seedProject("owner_txt", "pk_txt");
    const source = await seedSource(projectId, { type: "txt", title: "notes.txt" });
    signIn("owner_txt", projectId);
    readKnowledgeFile.mockResolvedValue(Buffer.from("Some notes."));

    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(201);
  });
});

describe("refusals clean up the row and the object", () => {
  it("rejects and cleans up an empty object", async () => {
    const projectId = await seedProject("owner_empty", "pk_empty");
    const source = await seedSource(projectId);
    signIn("owner_empty", projectId);
    readKnowledgeFile.mockResolvedValue(Buffer.alloc(0));

    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(400);
    expect(await sourceRows(source.id)).toHaveLength(0);
    expect(deleteKnowledgeFile).toHaveBeenCalledWith("projects/p/s");
    expect(captureServerEvent).not.toHaveBeenCalled();
  });

  it("rejects and cleans up an oversized object", async () => {
    const projectId = await seedProject("owner_big", "pk_big");
    const source = await seedSource(projectId);
    signIn("owner_big", projectId);
    readKnowledgeFile.mockResolvedValue(Buffer.alloc(11 * 1024 * 1024));

    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(413);
    expect(await sourceRows(source.id)).toHaveLength(0);
  });

  it("rejects and cleans up a fake PDF (wrong magic bytes)", async () => {
    const projectId = await seedProject("owner_fake", "pk_fake");
    const source = await seedSource(projectId);
    signIn("owner_fake", projectId);
    readKnowledgeFile.mockResolvedValue(Buffer.from("not a real pdf"));

    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(400);
    expect(await sourceRows(source.id)).toHaveLength(0);
    expect(deleteKnowledgeFile).toHaveBeenCalledWith("projects/p/s");
  });

  it("hands the row back to `uploading` and returns 500 when the row delete itself fails", async () => {
    const projectId = await seedProject("owner_delfail", "pk_delfail");
    const source = await seedSource(projectId);
    signIn("owner_delfail", projectId);
    vi.spyOn(console, "error").mockImplementation(() => {});
    readKnowledgeFile.mockResolvedValue(Buffer.alloc(0));
    deleteKnowledgeSource.mockRejectedValueOnce(new Error("db down"));

    const res = await POST(request(source.id), ctx(projectId));

    expect(res.status).toBe(500);
    // The row is kept (never reached the real pglite delete) and claimable again; the object is never removed.
    expect(await sourceRows(source.id)).toMatchObject([{ status: "uploading" }]);
    expect(deleteKnowledgeFile).not.toHaveBeenCalled();
  });
});

describe("storage read failure", () => {
  it("returns 400, keeps the source for a retry, and hands `uploading` back", async () => {
    const projectId = await seedProject("owner_readfail", "pk_readfail");
    const source = await seedSource(projectId);
    signIn("owner_readfail", projectId);
    vi.spyOn(console, "error").mockImplementation(() => {});
    readKnowledgeFile.mockRejectedValue(new Error("object not found"));

    const res = await POST(request(source.id), ctx(projectId));
    expect(res.status).toBe(400);
    expect(await sourceRows(source.id)).toMatchObject([{ status: "uploading" }]);
    expect(deleteKnowledgeFile).not.toHaveBeenCalled();
  });
});
