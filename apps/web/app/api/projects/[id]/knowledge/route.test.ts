// @vitest-environment node
import { createSupabaseTestDb } from "@askwell/db/supabase-pglite";
import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "../../../../../lib/supabase/fake";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ userId: null as string | null, owner: undefined as unknown }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));
// Ownership (lib/projects) and the plan (lib/data/billing) both read through the owner client
// (RLS); which rows RLS lets an owner see is tested against the real migrations on pglite
// (packages/db), so here another owner's project is simply a row the fake doesn't return.
vi.mock("../../../../../lib/supabase/owner", () => ({ createOwnerClient: () => state.owner }));

const embedTexts = vi.hoisted(() => vi.fn());
vi.mock("../../../../../lib/ai", () => ({ embedTexts }));

const captureServerEvent = vi.hoisted(() => vi.fn());
vi.mock("../../../../../lib/posthog/server", () => ({ captureServerEvent }));

// The service client is faked over a pglite db with the real Supabase migrations. Reservation
// (rpc("reserve_knowledge_source"), SB-T06) calls the real Postgres function, so its count, limit
// and FOR UPDATE lock are the ones under test. processKnowledgeSource's status update and chunk
// insert (lib/knowledge, SB-T07) proxy to the same db once the background ingest kicks in.
function from(table: string) {
  if (table === "knowledge_sources") {
    return {
      update: (values: { status: "ready" | "failed" }) => ({
        eq: async (_c: string, id: string) => {
          await db.query("UPDATE public.knowledge_sources SET status = $1 WHERE id = $2", [values.status, id]);
          return { error: null };
        },
      }),
    };
  }
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
  throw new Error(`unexpected table ${table}`);
}

type SourceRow = { id: string; title: string; type: string; status: string; created_at: Date };

async function rpc(name: string, args: Record<string, unknown>) {
  if (name !== "reserve_knowledge_source") throw new Error(`unexpected rpc ${name}`);
  try {
    const { rows } = await db.query<SourceRow>(
      "SELECT id, title, type, status, created_at FROM public.reserve_knowledge_source($1, $2, $3, $4, $5)",
      [args.p_project_id, args.p_title, args.p_type, args.p_storage_key, args.p_source_limit],
    );
    const row = rows[0]!;
    return { data: { ...row, created_at: row.created_at.toISOString() }, error: null };
  } catch (error) {
    // As PostgREST reports a raised SQLSTATE: in `code` (AWLIM, AWNOP, ...).
    const { code, message } = error as { code: string; message: string };
    return { data: null, error: { code, message } };
  }
}
vi.mock("../../../../../lib/supabase/service", () => ({ createServiceClient: () => ({ rpc, from }) }));

const { POST } = await import("./route");

let db: Awaited<ReturnType<typeof createSupabaseTestDb>>;

beforeAll(async () => {
  db = await createSupabaseTestDb();
});

afterAll(() => db.close());

beforeEach(() => {
  state.userId = null;
  state.owner = undefined;
  captureServerEvent.mockClear();
  embedTexts.mockReset();
  embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => Array(1536).fill(0.1)));
});

async function sourceStatus(id: string) {
  const { rows } = await db.query<{ status: string }>("SELECT status FROM public.knowledge_sources WHERE id = $1", [id]);
  return rows[0]?.status;
}

async function sourceCount(projectId: string) {
  const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.knowledge_sources WHERE project_id = $1", [projectId]);
  return rows[0]!.n;
}

/** Signs in `userId`, with an owner client that sees `projectId` as theirs (null: another owner's). */
function signIn(userId: string, projectId: string | null, plan: "free" | "pro" = "free") {
  state.userId = userId;
  state.owner = fakeSupabase({ from: { projects: { data: projectId && { id: projectId } }, accounts: { data: { plan } } } });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedProject(ownerId: string, plan: "free" | "pro", publicKey: string) {
  await db.query("INSERT INTO public.accounts (clerk_user_id, plan) VALUES ($1, $2) ON CONFLICT DO NOTHING", [ownerId, plan]);
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO public.projects (owner_id, name, public_key) VALUES ($1, 'Docs', $2) RETURNING id",
    [ownerId, publicKey],
  );
  signIn(ownerId, rows[0]!.id, plan);
  return rows[0]!.id;
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.test/api/projects/x/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("unauthenticated", () => {
  it("returns 401", async () => {
    const res = await POST(jsonRequest({ type: "text", title: "t", content: "c" }), ctx("any"));
    expect(res.status).toBe(401);
  });
});

describe("tenant isolation", () => {
  it("returns 404 for another owner's project", async () => {
    const projectId = await seedProject("owner_a", "free", "pk_a1");
    signIn("owner_b", null);
    const res = await POST(jsonRequest({ type: "text", title: "t", content: "c" }), ctx(projectId));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });
});

describe("pasted text", () => {
  it("creates a processing source and produces chunks in the background", async () => {
    const projectId = await seedProject("owner_text", "free", "pk_text");

    const res = await POST(jsonRequest({ type: "text", title: "Pricing FAQ", content: "We charge $10/month." }), ctx(projectId));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.source).toMatchObject({ title: "Pricing FAQ", type: "text", status: "processing" });

    await vi.waitFor(async () => {
      expect(await sourceStatus(body.source.id)).toBe("ready");
    });
    const { rows: chunks } = await db.query("SELECT 1 FROM public.knowledge_chunks WHERE source_id = $1", [body.source.id]);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("rejects blank content with 400", async () => {
    const projectId = await seedProject("owner_text2", "free", "pk_text2");
    const res = await POST(jsonRequest({ type: "text", title: "t", content: "" }), ctx(projectId));
    expect(res.status).toBe(400);
  });

  it("rejects pasted text over the MAX_KNOWLEDGE_FILE_BYTES cap with 400", async () => {
    const projectId = await seedProject("owner_text3", "free", "pk_text3");
    const tooBig = "a".repeat(MAX_KNOWLEDGE_FILE_BYTES + 1);
    const res = await POST(jsonRequest({ type: "text", title: "t", content: tooBig }), ctx(projectId));
    expect(res.status).toBe(400);
  });

  it("refuses a 4th source on Free with 403 plan_limit", async () => {
    const projectId = await seedProject("owner_limit", "free", "pk_limit");
    for (let i = 0; i < 3; i++) {
      const res = await POST(jsonRequest({ type: "text", title: `t${i}`, content: `content ${i}` }), ctx(projectId));
      expect(res.status).toBe(201);
    }

    const res = await POST(jsonRequest({ type: "text", title: "t4", content: "one too many" }), ctx(projectId));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("plan_limit");
  });

  it("allows more sources on Pro", async () => {
    const projectId = await seedProject("owner_pro", "pro", "pk_pro");
    for (let i = 0; i < 4; i++) {
      const res = await POST(jsonRequest({ type: "text", title: `t${i}`, content: `content ${i}` }), ctx(projectId));
      expect(res.status).toBe(201);
    }
  });

  it("keeps an existing project's sources over the new limit, but refuses more", async () => {
    const projectId = await seedProject("owner_over", "free", "pk_over");
    for (let i = 0; i < 5; i++) {
      await db.query("INSERT INTO public.knowledge_sources (project_id, title, type, status) VALUES ($1, $2, 'text', 'ready')", [
        projectId,
        `old ${i}`,
      ]);
    }
    const res = await POST(jsonRequest({ type: "text", title: "new", content: "more" }), ctx(projectId));
    expect(res.status).toBe(403);
    expect(await sourceCount(projectId)).toBe(5);
  });

  it("never lets concurrent pasted texts exceed the Free plan's 3-source limit", async () => {
    const projectId = await seedProject("owner_text_race", "free", "pk_text_race");
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, i) => POST(jsonRequest({ type: "text", title: `t${i}`, content: `c ${i}` }), ctx(projectId))),
    );
    expect(responses.filter((res) => res.status === 201)).toHaveLength(3);
    expect(await sourceCount(projectId)).toBe(3);
  });
});

describe("request size", () => {
  it("returns 413 on a Content-Length over the limit, before reading the body", async () => {
    const projectId = await seedProject("owner_big", "free", "pk_big");
    const request = jsonRequest({ type: "text", title: "t", content: "small" }, { "content-length": String(11 * 1024 * 1024) });
    const json = vi.spyOn(request, "json");

    const res = await POST(request, ctx(projectId));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("invalid_input");
    expect(json).not.toHaveBeenCalled();
  });

  it("allows a request plus JSON overhead through to the normal checks", async () => {
    const projectId = await seedProject("owner_edge", "free", "pk_edge");
    const request = jsonRequest(
      { type: "text", title: "t", content: "small" },
      { "content-length": String(MAX_KNOWLEDGE_FILE_BYTES + 1024) },
    );
    expect((await POST(request, ctx(projectId))).status).toBe(201);
  });
});

describe("knowledge_added", () => {
  it("fires for pasted text with type text", async () => {
    const projectId = await seedProject("owner_ev_text", "free", "pk_ev_text");
    const res = await POST(jsonRequest({ type: "text", title: "FAQ", content: "Hours: 9-5." }), ctx(projectId));
    expect(res.status).toBe(201);
    expect(captureServerEvent).toHaveBeenCalledExactlyOnceWith("owner_ev_text", "knowledge_added", {
      project_id: projectId,
      type: "text",
    });
  });

  it("doesn't fire when the add fails", async () => {
    const projectId = await seedProject("owner_ev_fail", "free", "pk_ev_fail");
    expect((await POST(jsonRequest({ type: "text", title: "t", content: "" }), ctx(projectId))).status).toBe(400);
    expect(captureServerEvent).not.toHaveBeenCalled();
  });
});

describe("content type", () => {
  it("rejects a request that isn't JSON, including multipart (files go through the upload flow instead)", async () => {
    const projectId = await seedProject("owner_badtype", "free", "pk_badtype");
    const form = new FormData();
    form.set("file", new Blob(["x"]), "doc.txt");
    const res = await POST(new Request("https://app.test/api/projects/x/knowledge", { method: "POST", body: form }), ctx(projectId));
    expect(res.status).toBe(400);
  });

  it("rejects plain text", async () => {
    const projectId = await seedProject("owner_badtype2", "free", "pk_badtype2");
    const res = await POST(
      new Request("https://app.test/api/projects/x/knowledge", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "hello",
      }),
      ctx(projectId),
    );
    expect(res.status).toBe(400);
  });
});
