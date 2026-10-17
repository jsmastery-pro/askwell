import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addFileKnowledge, addTextKnowledge, deleteKnowledgeSource } from "./knowledge-actions";

const fetchMock = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
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
  it("POSTs a multipart form with the file and optional title", async () => {
    const source = { id: "s2", title: "doc.pdf", type: "pdf", status: "processing", createdAt: "2026-01-01T00:00:00.000Z" };
    fetchMock.mockResolvedValue(jsonResponse({ source }));
    const file = new File(["%PDF"], "doc.pdf");

    await addFileKnowledge("p1", file, "My title");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/projects/p1/knowledge");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("file")).toBe(file);
    expect(form.get("title")).toBe("My title");
  });

  it("omits the title field when none is given", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ source: {} }));
    await addFileKnowledge("p1", new File(["x"], "x.txt"));
    const form = fetchMock.mock.calls[0]![1].body as FormData;
    expect(form.get("title")).toBeNull();
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
