import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ uploadToSignedUrl: vi.fn() }));
const from = vi.hoisted(() => vi.fn(() => storage));
const createClient = vi.hoisted(() => vi.fn(() => ({ storage: { from } })));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

async function fresh() {
  vi.resetModules();
  return import("./browser");
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  createClient.mockClear();
  from.mockClear();
  storage.uploadToSignedUrl.mockReset();
});

describe("uploadKnowledgeFileToSignedUrl", () => {
  it("uploads the file to the knowledge bucket via the signed path and token", async () => {
    storage.uploadToSignedUrl.mockResolvedValue({ data: { path: "projects/p/s" }, error: null });
    const file = new File(["x"], "doc.pdf");

    await (await fresh()).uploadKnowledgeFileToSignedUrl("projects/p/s", "tok", file, "application/pdf");

    expect(createClient).toHaveBeenCalledWith("https://project.supabase.co", "sb_publishable_test", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(from).toHaveBeenCalledWith("knowledge");
    expect(storage.uploadToSignedUrl).toHaveBeenCalledWith("projects/p/s", "tok", file, { contentType: "application/pdf" });
  });

  it("omits the content type option when none is given", async () => {
    storage.uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    const file = new File(["x"], "doc");

    await (await fresh()).uploadKnowledgeFileToSignedUrl("projects/p/s", "tok", file);

    expect(storage.uploadToSignedUrl).toHaveBeenCalledWith("projects/p/s", "tok", file, undefined);
  });

  it("reuses one client across calls", async () => {
    storage.uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    const mod = await fresh();
    await mod.uploadKnowledgeFileToSignedUrl("a", "t", new File(["x"], "a.txt"));
    await mod.uploadKnowledgeFileToSignedUrl("b", "t", new File(["x"], "b.txt"));
    expect(createClient).toHaveBeenCalledOnce();
  });

  it("throws the storage error", async () => {
    storage.uploadToSignedUrl.mockResolvedValue({ data: null, error: new Error("upload rejected") });
    await expect(
      (await fresh()).uploadKnowledgeFileToSignedUrl("projects/p/s", "tok", new File(["x"], "a.txt")),
    ).rejects.toThrow("upload rejected");
  });

  it("throws, naming what's missing, rather than silently no-op", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await expect(
      (await fresh()).uploadKnowledgeFileToSignedUrl("projects/p/s", "tok", new File(["x"], "a.txt")),
    ).rejects.toThrow("Storage is not configured (missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)");
  });
});
