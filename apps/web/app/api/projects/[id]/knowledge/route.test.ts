// @vitest-environment node
import { accounts, knowledgeChunks, knowledgeSources, projects } from "@askwell/db";
import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../../../lib/widget-config/test-db";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ db: undefined as unknown, userId: null as string | null }));
vi.mock("@askwell/db/client", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));

const embedTexts = vi.hoisted(() => vi.fn());
vi.mock("../../../../../lib/ai", () => ({ embedTexts }));

const captureServerEvent = vi.hoisted(() => vi.fn());
vi.mock("../../../../../lib/posthog/server", () => ({ captureServerEvent }));

// Reservation now goes through the service client's rpc("reserve_knowledge_source") (SB-T06).
// This fake re-implements the real Postgres function's count+limit+insert, over the SAME pglite
// db processKnowledgeSource (still Drizzle on this branch) reads and writes — same FOR UPDATE
// lock the real function uses, so the existing concurrency test still holds.
const fake = vi.hoisted(() => ({ account: null as { plan: string } | null }));

function from(table: string) {
  if (table === "accounts") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.account, error: null }) }) }) };
  throw new Error(`unexpected table ${table}`);
}

async function rpc(name: string, args: Record<string, unknown>) {
  if (name !== "reserve_knowledge_source") throw new Error(`unexpected rpc ${name}`);
  const projectId = args.p_project_id as string;
  const limit = args.p_source_limit as number;
  const row = await db.transaction(async (tx) => {
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).for("update");
    const existing = await tx.select({ id: knowledgeSources.id }).from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId));
    if (existing.length >= limit) return null;
    const [inserted] = await tx
      .insert(knowledgeSources)
      .values({ projectId, title: args.p_title as string, type: "text", status: "processing" })
      .returning();
    return inserted!;
  });
  if (!row) return { data: null, error: { code: "AWLIM" } };
  return {
    data: { id: row.id, title: row.title, type: row.type, status: row.status, created_at: row.createdAt.toISOString() },
    error: null,
  };
}
vi.mock("../../../../../lib/supabase/service", () => ({ createServiceClient: () => ({ from, rpc }) }));

const { POST } = await import("./route");

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
});

afterAll(() => close());

beforeEach(() => {
  state.userId = null;
  fake.account = null;
  captureServerEvent.mockClear();
  embedTexts.mockReset();
  embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => Array(1536).fill(0.1)));
});

const as = (userId: string | null) => {
  state.userId = userId;
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedProject(ownerId: string, plan: "free" | "pro", publicKey: string) {
  await db.insert(accounts).values({ clerkUserId: ownerId, plan }).onConflictDoNothing();
  const [project] = await db.insert(projects).values({ ownerId, name: "Docs", publicKey }).returning();
  fake.account = { plan };
  return project!.id;
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
    as("owner_b");
    const res = await POST(jsonRequest({ type: "text", title: "t", content: "c" }), ctx(projectId));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });
});

describe("pasted text", () => {
  it("creates a processing source and produces chunks in the background", async () => {
    const projectId = await seedProject("owner_text", "free", "pk_text");
    as("owner_text");

    const res = await POST(jsonRequest({ type: "text", title: "Pricing FAQ", content: "We charge $10/month." }), ctx(projectId));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.source).toMatchObject({ title: "Pricing FAQ", type: "text", status: "processing" });

    await vi.waitFor(async () => {
      const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, body.source.id));
      expect(row?.status).toBe("ready");
    });
    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, body.source.id));
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("rejects blank content with 400", async () => {
    const projectId = await seedProject("owner_text2", "free", "pk_text2");
    as("owner_text2");
    const res = await POST(jsonRequest({ type: "text", title: "t", content: "" }), ctx(projectId));
    expect(res.status).toBe(400);
  });

  it("rejects pasted text over the MAX_KNOWLEDGE_FILE_BYTES cap with 400", async () => {
    const projectId = await seedProject("owner_text3", "free", "pk_text3");
    as("owner_text3");
    const tooBig = "a".repeat(MAX_KNOWLEDGE_FILE_BYTES + 1);
    const res = await POST(jsonRequest({ type: "text", title: "t", content: tooBig }), ctx(projectId));
    expect(res.status).toBe(400);
  });

  it("refuses a 4th source on Free with 403 plan_limit", async () => {
    const projectId = await seedProject("owner_limit", "free", "pk_limit");
    as("owner_limit");
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
    as("owner_pro");
    for (let i = 0; i < 4; i++) {
      const res = await POST(jsonRequest({ type: "text", title: `t${i}`, content: `content ${i}` }), ctx(projectId));
      expect(res.status).toBe(201);
    }
  });

  it("keeps an existing project's sources over the new limit, but refuses more", async () => {
    const projectId = await seedProject("owner_over", "free", "pk_over");
    as("owner_over");
    for (let i = 0; i < 5; i++) {
      await db.insert(knowledgeSources).values({ projectId, title: `old ${i}`, type: "text", status: "ready" });
    }
    const res = await POST(jsonRequest({ type: "text", title: "new", content: "more" }), ctx(projectId));
    expect(res.status).toBe(403);
    expect(await db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId))).toHaveLength(5);
  });

  it("never lets concurrent pasted texts exceed the Free plan's 3-source limit", async () => {
    const projectId = await seedProject("owner_text_race", "free", "pk_text_race");
    as("owner_text_race");
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, i) => POST(jsonRequest({ type: "text", title: `t${i}`, content: `c ${i}` }), ctx(projectId))),
    );
    expect(responses.filter((res) => res.status === 201)).toHaveLength(3);
    expect(await db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId))).toHaveLength(3);
  });
});

describe("request size", () => {
  it("returns 413 on a Content-Length over the limit, before reading the body", async () => {
    const projectId = await seedProject("owner_big", "free", "pk_big");
    as("owner_big");
    const request = jsonRequest({ type: "text", title: "t", content: "small" }, { "content-length": String(11 * 1024 * 1024) });
    const json = vi.spyOn(request, "json");

    const res = await POST(request, ctx(projectId));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("invalid_input");
    expect(json).not.toHaveBeenCalled();
  });

  it("allows a request plus JSON overhead through to the normal checks", async () => {
    const projectId = await seedProject("owner_edge", "free", "pk_edge");
    as("owner_edge");
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
    as("owner_ev_text");
    const res = await POST(jsonRequest({ type: "text", title: "FAQ", content: "Hours: 9-5." }), ctx(projectId));
    expect(res.status).toBe(201);
    expect(captureServerEvent).toHaveBeenCalledExactlyOnceWith("owner_ev_text", "knowledge_added", {
      project_id: projectId,
      type: "text",
    });
  });

  it("doesn't fire when the add fails", async () => {
    const projectId = await seedProject("owner_ev_fail", "free", "pk_ev_fail");
    as("owner_ev_fail");
    expect((await POST(jsonRequest({ type: "text", title: "t", content: "" }), ctx(projectId))).status).toBe(400);
    expect(captureServerEvent).not.toHaveBeenCalled();
  });
});

describe("content type", () => {
  it("rejects a request that isn't JSON, including multipart (files go through the upload flow instead)", async () => {
    const projectId = await seedProject("owner_badtype", "free", "pk_badtype");
    as("owner_badtype");
    const form = new FormData();
    form.set("file", new Blob(["x"]), "doc.txt");
    const res = await POST(new Request("https://app.test/api/projects/x/knowledge", { method: "POST", body: form }), ctx(projectId));
    expect(res.status).toBe(400);
  });

  it("rejects plain text", async () => {
    const projectId = await seedProject("owner_badtype2", "free", "pk_badtype2");
    as("owner_badtype2");
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
