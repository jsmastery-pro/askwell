// @vitest-environment node
import { accounts, knowledgeChunks, knowledgeSources, projects } from "@askwell/db";
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

  it("pasted text doesn't count toward the file limit", async () => {
    const projectId = await seedProject("owner_mixed", "free", "pk_mixed");
    as("owner_mixed");
    for (let i = 0; i < 5; i++) {
      await POST(jsonRequest({ type: "text", title: `t${i}`, content: `content ${i}` }), ctx(projectId));
    }
    for (let i = 0; i < 3; i++) {
      const res = await POST(fileRequest(new Blob([Buffer.from(`Doc ${i}`)]), `doc${i}.txt`), ctx(projectId));
      expect(res.status).toBe(201);
    }
    const res = await POST(fileRequest(new Blob([Buffer.from("Doc 4")]), "doc4.txt"), ctx(projectId));
    expect(res.status).toBe(403);
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
