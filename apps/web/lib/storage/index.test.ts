// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const storage = vi.hoisted(() => ({
  createSignedUploadUrl: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
}));
const from = vi.hoisted(() => vi.fn(() => storage));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ storage: { from } }),
}));

const { createKnowledgeUploadUrl, deleteKnowledgeFile, knowledgeFileKey, readKnowledgeFile } = await import("./index");

afterEach(() => {
  from.mockClear();
  storage.createSignedUploadUrl.mockReset();
  storage.download.mockReset();
  storage.remove.mockReset();
});

describe("knowledgeFileKey", () => {
  it("never produces a public URL, only a private key", () => {
    const key = knowledgeFileKey("project-1", "source-1");
    expect(key).toBe("projects/project-1/source-1");
    expect(key).not.toMatch(/^https?:\/\//);
  });
});

describe("createKnowledgeUploadUrl", () => {
  it("signs an upload for the given key in the knowledge bucket", async () => {
    storage.createSignedUploadUrl.mockResolvedValue({ data: { path: "projects/p/s", token: "tok" }, error: null });
    const result = await createKnowledgeUploadUrl("projects/p/s");
    expect(from).toHaveBeenCalledWith("knowledge");
    expect(storage.createSignedUploadUrl).toHaveBeenCalledWith("projects/p/s");
    expect(result).toEqual({ path: "projects/p/s", token: "tok" });
  });

  it("throws the storage error", async () => {
    storage.createSignedUploadUrl.mockResolvedValue({ data: null, error: new Error("bucket down") });
    await expect(createKnowledgeUploadUrl("projects/p/s")).rejects.toThrow("bucket down");
  });
});

describe("readKnowledgeFile", () => {
  it("returns the downloaded object as a buffer", async () => {
    const blob = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    storage.download.mockResolvedValue({ data: blob, error: null });
    const buffer = await readKnowledgeFile("projects/p/s");
    expect(storage.download).toHaveBeenCalledWith("projects/p/s");
    expect(buffer).toEqual(Buffer.from([1, 2, 3]));
  });

  it("throws the storage error", async () => {
    storage.download.mockResolvedValue({ data: null, error: new Error("not found") });
    await expect(readKnowledgeFile("projects/p/s")).rejects.toThrow("not found");
  });
});

describe("deleteKnowledgeFile", () => {
  it("removes the object from the knowledge bucket", async () => {
    storage.remove.mockResolvedValue({ data: [], error: null });
    await deleteKnowledgeFile("projects/p/s");
    expect(storage.remove).toHaveBeenCalledWith(["projects/p/s"]);
  });

  it("throws the storage error", async () => {
    storage.remove.mockResolvedValue({ data: null, error: new Error("gone") });
    await expect(deleteKnowledgeFile("projects/p/s")).rejects.toThrow("gone");
  });
});
