// @vitest-environment node
import { accounts, knowledgeChunks, knowledgeSources, projects } from "@askwell/db";
import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

const uploadKnowledgeFile = vi.hoisted(() => vi.fn());
vi.mock("../../../../../lib/storage", () => ({
  knowledgeFileKey: (projectId: string, sourceId: string) => `projects/${projectId}/${sourceId}`,
  uploadKnowledgeFile,
}));

const { POST } = await import("./route");

const samplePdf = readFileSync(fileURLToPath(new URL("../../../../../lib/knowledge/fixtures/sample.pdf", import.meta.url)));

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
});

afterAll(() => close());

beforeEach(() => {
  state.userId = null;
  captureServerEvent.mockClear();
  uploadKnowledgeFile.mockReset();
  uploadKnowledgeFile.mockResolvedValue(undefined);
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
  return project!.id;
}

function jsonRequest(body: unknown) {
  return new Request("https://app.test/api/projects/x/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fileRequest(file: Blob, filename: string, title?: string) {
  const form = new FormData();
  form.set("file", file, filename);
  if (title) form.set("title", title);
  return new Request("https://app.test/api/projects/x/knowledge", { method: "POST", body: form });
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

  it("rejects pasted text over the 10 MB cap with 400", async () => {
    const projectId = await seedProject("owner_text3", "free", "pk_text3");
    as("owner_text3");
    const tooBig = "a".repeat(MAX_KNOWLEDGE_FILE_BYTES + 1);
    const res = await POST(jsonRequest({ type: "text", title: "t", content: tooBig }), ctx(projectId));
    expect(res.status).toBe(400);
  });
});

describe("file upload", () => {
  it("uploads a real PDF and ends with status ready and chunks stored", async () => {
    const projectId = await seedProject("owner_pdf", "free", "pk_pdf");
    as("owner_pdf");

    const res = await POST(fileRequest(new Blob([samplePdf]), "handbook.pdf"), ctx(projectId));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.source).toMatchObject({ title: "handbook.pdf", type: "pdf", status: "processing" });
    expect(uploadKnowledgeFile).toHaveBeenCalledWith(
      `projects/${projectId}/${body.source.id}`,
      expect.any(Buffer),
      expect.any(String),
    );

    await vi.waitFor(async () => {
      const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, body.source.id));
      expect(row?.status).toBe("ready");
    });
    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, body.source.id));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.content).toContain("Hello World");
  });

  it("sets the source failed when extraction throws", async () => {
    const projectId = await seedProject("owner_badpdf", "free", "pk_badpdf");
    as("owner_badpdf");
    // Valid magic bytes, but not a real PDF body, so unpdf's parser fails.
    const brokenPdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("not actually a pdf body")]);

    const res = await POST(fileRequest(new Blob([brokenPdf]), "broken.pdf"), ctx(projectId));
    const body = await res.json();
    expect(res.status).toBe(201);

    await vi.waitFor(async () => {
      const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, body.source.id));
      expect(row?.status).toBe("failed");
    });
  });

  it("deletes the source and frees its file slot when storage upload fails", async () => {
    const projectId = await seedProject("owner_uploadfail", "free", "pk_uploadfail");
    as("owner_uploadfail");
    uploadKnowledgeFile.mockRejectedValueOnce(new Error("network error"));

    const res = await POST(fileRequest(new Blob([Buffer.from("Doc")]), "doc.txt"), ctx(projectId));
    expect(res.status).toBe(500);

    const rows = await db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId));
    expect(rows).toHaveLength(0);

    // The freed slot doesn't count against the plan limit: all 3 Free files still fit.
    for (let i = 0; i < 3; i++) {
      const retry = await POST(fileRequest(new Blob([Buffer.from(`Doc ${i}`)]), `doc${i}.txt`), ctx(projectId));
      expect(retry.status).toBe(201);
    }
  });

  it("rejects a renamed .exe with 400", async () => {
    const projectId = await seedProject("owner_exe", "free", "pk_exe");
    as("owner_exe");
    const res = await POST(fileRequest(new Blob([Buffer.from("MZ...")]), "virus.exe"), ctx(projectId));
    expect(res.status).toBe(400);
  });

  it("rejects an 11 MB file with 400", async () => {
    const projectId = await seedProject("owner_big", "free", "pk_big");
    as("owner_big");
    const big = Buffer.alloc(11 * 1024 * 1024, "a");
    const res = await POST(fileRequest(new Blob([big]), "big.txt"), ctx(projectId));
    expect(res.status).toBe(400);
  });

  it("rejects a fake PDF (wrong magic bytes) with 400", async () => {
    const projectId = await seedProject("owner_fake", "free", "pk_fake");
    as("owner_fake");
    const res = await POST(fileRequest(new Blob([Buffer.from("not a real pdf")]), "fake.pdf"), ctx(projectId));
    expect(res.status).toBe(400);
    expect(uploadKnowledgeFile).not.toHaveBeenCalled();
  });

  it("refuses a 4th file on Free with 403 plan_limit", async () => {
    const projectId = await seedProject("owner_limit", "free", "pk_limit");
    as("owner_limit");
    for (let i = 0; i < 3; i++) {
      const res = await POST(fileRequest(new Blob([Buffer.from(`Doc ${i}`)]), `doc${i}.txt`), ctx(projectId));
      expect(res.status).toBe(201);
    }

    const res = await POST(fileRequest(new Blob([Buffer.from("Doc 4")]), "doc4.txt"), ctx(projectId));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("plan_limit");
  });

  it("allows more files on Pro", async () => {
    const projectId = await seedProject("owner_pro", "pro", "pk_pro");
    as("owner_pro");
    for (let i = 0; i < 4; i++) {
      const res = await POST(fileRequest(new Blob([Buffer.from(`Doc ${i}`)]), `doc${i}.txt`), ctx(projectId));
      expect(res.status).toBe(201);
    }
  });

  it("counts pasted text toward the same limit: a Free project's 4th source is refused, text or file", async () => {
    const projectId = await seedProject("owner_mixed", "free", "pk_mixed");
    as("owner_mixed");
    for (let i = 0; i < 2; i++) {
      const res = await POST(jsonRequest({ type: "text", title: `t${i}`, content: `content ${i}` }), ctx(projectId));
      expect(res.status).toBe(201);
    }
    expect((await POST(fileRequest(new Blob([Buffer.from("Doc")]), "doc.txt"), ctx(projectId))).status).toBe(201);

    const text = await POST(jsonRequest({ type: "text", title: "t4", content: "one too many" }), ctx(projectId));
    expect(text.status).toBe(403);
    expect((await text.json()).error.code).toBe("plan_limit");
    const file = await POST(fileRequest(new Blob([Buffer.from("Doc 4")]), "doc4.txt"), ctx(projectId));
    expect(file.status).toBe(403);
    expect(await db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId))).toHaveLength(3);
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

  it("never lets concurrent uploads exceed the Free plan's 3-file limit", async () => {
    const projectId = await seedProject("owner_race", "free", "pk_race");
    as("owner_race");

    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, i) => POST(fileRequest(new Blob([Buffer.from(`Doc ${i}`)]), `doc${i}.txt`), ctx(projectId))),
    );

    const succeeded = responses.filter((res) => res.status === 201);
    expect(succeeded).toHaveLength(3);
    const stored = await db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId));
    expect(stored).toHaveLength(3);
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

  it("fires for a file with its file type", async () => {
    const projectId = await seedProject("owner_ev_file", "free", "pk_ev_file");
    as("owner_ev_file");
    const res = await POST(fileRequest(new Blob([samplePdf]), "guide.pdf"), ctx(projectId));
    expect(res.status).toBe(201);
    expect(captureServerEvent).toHaveBeenCalledExactlyOnceWith("owner_ev_file", "knowledge_added", {
      project_id: projectId,
      type: "pdf",
    });
  });

  it("doesn't fire when the add fails (rejected type, failed upload)", async () => {
    const projectId = await seedProject("owner_ev_fail", "free", "pk_ev_fail");
    as("owner_ev_fail");
    expect((await POST(fileRequest(new Blob(["x"]), "virus.exe"), ctx(projectId))).status).toBe(400);

    vi.spyOn(console, "error").mockImplementation(() => {});
    uploadKnowledgeFile.mockRejectedValueOnce(new Error("storage down"));
    expect((await POST(fileRequest(new Blob(["Doc"]), "doc.txt"), ctx(projectId))).status).toBe(500);

    expect(captureServerEvent).not.toHaveBeenCalled();
  });
});

describe("content type", () => {
  it("rejects a request that is neither JSON nor multipart", async () => {
    const projectId = await seedProject("owner_badtype", "free", "pk_badtype");
    as("owner_badtype");
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
