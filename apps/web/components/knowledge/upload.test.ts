import type { KnowledgeSource } from "@askwell/shared";
import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { finalizeKnowledgeFile, uploadKnowledgeFile, type UploadDeps, type UploadStep } from "./upload";

const reserved: KnowledgeSource = {
  id: "s1",
  project_id: "p1",
  title: "guide.md",
  type: "md",
  storage_key: "p1/s1.md",
  status: "uploading",
  created_at: "2026-11-04T09:00:00Z",
};
const upload = { path: "p1/s1.md", token: "tok", signedUrl: "https://x.supabase.co/sign" };
const failure = (code: "internal" | "plan_limit_reached" | "validation_failed") => ({
  ok: false as const,
  error: { code, message: code },
});

function deps(overrides: Partial<UploadDeps> = {}) {
  return {
    createUploadUrl: vi.fn<UploadDeps["createUploadUrl"]>(async () => ({ ok: true, data: { source: reserved, upload } })),
    putSignedUpload: vi.fn<UploadDeps["putSignedUpload"]>(async () => ({ ok: true, data: null })),
    finalizeUpload: vi.fn<UploadDeps["finalizeUpload"]>(async () => ({
      ok: true,
      data: { ...reserved, status: "processing" },
    })),
    deleteSource: vi.fn<UploadDeps["deleteSource"]>(async () => ({ ok: true, data: "s1" })),
    ...overrides,
  };
}

// Browsers often report "" for .md files.
const file = (name = "guide.md", size = 12, type = "") => {
  const f = new File(["# Guide"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("uploadKnowledgeFile", () => {
  it("reserves, uploads to the signed URL, then finalizes, reporting each step", async () => {
    const d = deps();
    const steps: UploadStep[] = [];
    const f = file();
    const result = await uploadKnowledgeFile("p1", f, (s) => steps.push(s), d);

    expect(result).toEqual({ ok: true, source: { ...reserved, status: "processing" } });
    expect(steps).toEqual(["check", "reserve", "upload", "finalize"]);
    expect(d.createUploadUrl).toHaveBeenCalledWith("p1", { fileName: "guide.md", sizeBytes: 12, mimeType: "text/markdown" });
    expect(d.putSignedUpload).toHaveBeenCalledWith(upload, f, "text/markdown");
    expect(d.finalizeUpload).toHaveBeenCalledWith("p1", "s1");
    expect(d.deleteSource).not.toHaveBeenCalled();
  });

  it("reports the reserved source id before the file is sent (so its row can't be finished mid-upload)", async () => {
    const order: string[] = [];
    const d = deps({
      putSignedUpload: vi.fn<UploadDeps["putSignedUpload"]>(async () => {
        order.push("put");
        return { ok: true, data: null };
      }),
    });
    await uploadKnowledgeFile("p1", file(), undefined, d, (id) => order.push(`reserved ${id}`));
    expect(order).toEqual(["reserved s1", "put"]);
  });

  it("reports nothing when the reservation fails", async () => {
    const d = deps({ createUploadUrl: vi.fn<UploadDeps["createUploadUrl"]>(async () => failure("plan_limit_reached")) });
    const onReserved = vi.fn();
    await uploadKnowledgeFile("p1", file(), undefined, d, onReserved);
    expect(onReserved).not.toHaveBeenCalled();
  });

  it("stops at the check for a file that's too big, calling nothing", async () => {
    const d = deps();
    const result = await uploadKnowledgeFile("p1", file("big.pdf", MAX_KNOWLEDGE_FILE_BYTES + 1, "application/pdf"), undefined, d);
    expect(result).toMatchObject({ ok: false, step: "check", error: { code: "validation_failed" } });
    expect(d.createUploadUrl).not.toHaveBeenCalled();
  });

  it("returns the reserve error (e.g. plan_limit_reached) and uploads nothing", async () => {
    const d = deps({ createUploadUrl: vi.fn(async () => failure("plan_limit_reached")) });
    const result = await uploadKnowledgeFile("p1", file(), undefined, d);
    expect(result).toEqual({ ok: false, step: "reserve", error: { code: "plan_limit_reached", message: "plan_limit_reached" } });
    expect(d.putSignedUpload).not.toHaveBeenCalled();
  });

  it("when the Storage upload fails, deletes the reservation and doesn't finalize", async () => {
    const d = deps({ putSignedUpload: vi.fn(async () => failure("internal")) });
    const result = await uploadKnowledgeFile("p1", file(), undefined, d);
    expect(result).toMatchObject({ ok: false, step: "upload", pendingSourceId: null });
    expect(d.deleteSource).toHaveBeenCalledWith("s1");
    expect(d.finalizeUpload).not.toHaveBeenCalled();
  });

  it("when the Storage upload fails and deleting the reservation fails too, reports the pending source", async () => {
    const d = deps({
      putSignedUpload: vi.fn(async () => failure("internal")),
      deleteSource: vi.fn(async () => failure("internal")),
    });
    const result = await uploadKnowledgeFile("p1", file(), undefined, d);
    expect(result).toMatchObject({ ok: false, step: "upload", error: { code: "internal" }, pendingSourceId: "s1" });
    expect(d.finalizeUpload).not.toHaveBeenCalled();
  });

  it("returns the finalize error (the server deletes a refused file)", async () => {
    const d = deps({ finalizeUpload: vi.fn(async () => failure("validation_failed")) });
    const result = await uploadKnowledgeFile("p1", file(), undefined, d);
    expect(result).toMatchObject({ ok: false, step: "finalize", error: { code: "validation_failed" }, pendingSourceId: "s1" });
    expect(d.deleteSource).not.toHaveBeenCalled();
  });

  it("finalizeKnowledgeFile retries finalize alone with the same source id", async () => {
    const d = deps();
    const steps: UploadStep[] = [];
    const result = await finalizeKnowledgeFile("p1", "s1", (s) => steps.push(s), d);
    expect(result).toEqual({ ok: true, source: { ...reserved, status: "processing" } });
    expect(steps).toEqual(["finalize"]);
    expect(d.finalizeUpload).toHaveBeenCalledWith("p1", "s1");
    expect(d.createUploadUrl).not.toHaveBeenCalled();
  });
});
