import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const uploadKnowledgeFileToSignedUrl = vi.hoisted(() => vi.fn());
vi.mock("../storage/browser", () => ({ uploadKnowledgeFileToSignedUrl }));

const { addFileKnowledge, addTextKnowledge, deleteKnowledgeSource } = await import("./knowledge-actions");

const fetchMock = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  uploadKnowledgeFileToSignedUrl.mockResolvedValue(undefined);
});

afterEach(() => {
  fetchMock.mockReset();
  uploadKnowledgeFileToSignedUrl.mockReset();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe("addTextKnowledge", () => {
  it("POSTs JSON to the project's knowledge route", async () => {
    const source = { id: "s1", title: "FAQ", type: "text", status: "processing", createdAt: "2026-01-01T00:00:00.000Z" };
    fetchMock.mockResolvedValue(jsonResponse({ source }));

    const result = await addTextKnowledge("p1", { type: "text", title: "FAQ", content: "Hi" });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "text", title: "FAQ", content: "Hi" }),
    });
    expect(result).toEqual({ source });
  });

  it("throws the server's error message on failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "invalid_input", message: "Too long." } }, false));
    await expect(addTextKnowledge("p1", { type: "text", title: "t", content: "c" })).rejects.toThrow("Too long.");
  });
});

describe("addFileKnowledge", () => {
  const reservedSource = { id: "s2", title: "doc.pdf", type: "pdf", status: "processing", createdAt: "2026-01-01T00:00:00.000Z" };
  const finalSource = { ...reservedSource, status: "processing" };

  it("requests an upload URL, uploads to it, then finalizes", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ source: reservedSource, path: "projects/p1/s2", token: "tok" }))
      .mockResolvedValueOnce(jsonResponse({ source: finalSource }));
    const file = new File(["%PDF"], "doc.pdf");

    const result = await addFileKnowledge("p1", file, "My title");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/projects/p1/knowledge/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "doc.pdf", size: file.size, title: "My title" }),
    });
    expect(uploadKnowledgeFileToSignedUrl).toHaveBeenCalledExactlyOnceWith("projects/p1/s2", "tok", file, "application/pdf");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/projects/p1/knowledge/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: "s2" }),
    });
    expect(result).toEqual({ source: finalSource });
  });

  it("omits the title field when none is given", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ source: reservedSource, path: "projects/p1/s2", token: "tok" }))
      .mockResolvedValueOnce(jsonResponse({ source: finalSource }));
    await addFileKnowledge("p1", new File(["x"], "x.txt"));
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.title).toBeUndefined();
  });

  it("throws, never finalizes, and frees the slot right away when the signed upload itself fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ source: reservedSource, path: "projects/p1/s2", token: "tok" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    uploadKnowledgeFileToSignedUrl.mockRejectedValue(new Error("network error"));

    await expect(addFileKnowledge("p1", new File(["x"], "x.txt"))).rejects.toThrow("network error");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/knowledge/s2", { method: "DELETE" });
  });

  it("still throws the original error even if freeing the slot also fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ source: reservedSource, path: "projects/p1/s2", token: "tok" }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: "not_found", message: "gone" } }, false));
    uploadKnowledgeFileToSignedUrl.mockRejectedValue(new Error("network error"));

    await expect(addFileKnowledge("p1", new File(["x"], "x.txt"))).rejects.toThrow("network error");
  });

  it("throws the server's error message when requesting the upload URL fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: "plan_limit", message: "Your plan allows 3 sources." } }, false),
    );
    await expect(addFileKnowledge("p1", new File(["x"], "x.txt"))).rejects.toThrow("Your plan allows 3 sources.");
    expect(uploadKnowledgeFileToSignedUrl).not.toHaveBeenCalled();
  });
});

describe("deleteKnowledgeSource", () => {
  it("DELETEs the source by id", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const result = await deleteKnowledgeSource("s1");
    expect(fetchMock).toHaveBeenCalledWith("/api/knowledge/s1", { method: "DELETE" });
    expect(result).toEqual({ ok: true });
  });

  it("throws a generic message when the error body can't be read", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => { throw new Error("bad json"); } } as unknown as Response);
    await expect(deleteKnowledgeSource("s1")).rejects.toThrow("Request failed.");
  });
});
