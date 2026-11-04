import { afterEach, describe, expect, it, vi } from "vitest";
import { createTextSource, createUploadUrl, deleteSource, finalizeUpload } from "./api";

const calls: { url: string; init?: RequestInit }[] = [];

function respondWith(response: Response | Error) {
  calls.length = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return response;
  });
}

const source = {
  id: "s1",
  project_id: "p1",
  title: "Handbook",
  type: "pdf",
  storage_key: "p1/s1.pdf",
  status: "uploading",
  created_at: "2026-11-04T09:00:00Z",
};
const upload = { path: "p1/s1.pdf", token: "tok", signedUrl: "https://x.supabase.co/sign" };

afterEach(() => vi.unstubAllGlobals());

describe("knowledge API client", () => {
  it("createTextSource POSTs { title, text } to the project's knowledge route", async () => {
    const ready = { ...source, type: "text", storage_key: null, status: "ready" };
    respondWith(Response.json({ source: ready }, { status: 201 }));
    expect(await createTextSource("p1", { title: "FAQ", text: "Hi" })).toEqual({ ok: true, data: ready });
    expect(calls[0]?.url).toBe("/api/projects/p1/knowledge");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ title: "FAQ", text: "Hi" }));
  });

  it("createUploadUrl POSTs the declared file and returns the source and signed upload", async () => {
    respondWith(Response.json({ source, upload }, { status: 201 }));
    const body = { fileName: "h.pdf", sizeBytes: 10, mimeType: "application/pdf" };
    expect(await createUploadUrl("p1", body)).toEqual({ ok: true, data: { source, upload } });
    expect(calls[0]?.url).toBe("/api/projects/p1/knowledge/upload-url");
    expect(calls[0]?.init?.body).toBe(JSON.stringify(body));
  });

  it("finalizeUpload POSTs { sourceId }", async () => {
    respondWith(Response.json({ source: { ...source, status: "processing" } }));
    expect(await finalizeUpload("p1", "s1")).toMatchObject({ ok: true, data: { status: "processing" } });
    expect(calls[0]?.url).toBe("/api/projects/p1/knowledge/finalize");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ sourceId: "s1" }));
  });

  it("deleteSource DELETEs /api/knowledge/:id", async () => {
    respondWith(Response.json({ id: "s1" }));
    expect(await deleteSource("s1")).toEqual({ ok: true, data: "s1" });
    expect(calls[0]?.url).toBe("/api/knowledge/s1");
    expect(calls[0]?.init?.method).toBe("DELETE");
  });

  it("encodes ids in the URL", async () => {
    respondWith(Response.json({ id: "a/b" }));
    await deleteSource("a/b");
    expect(calls[0]?.url).toBe("/api/knowledge/a%2Fb");
  });

  it("returns the §8 error from a 403 plan_limit_reached", async () => {
    const error = { code: "plan_limit_reached", message: "Your Free plan allows 3 sources." };
    respondWith(Response.json({ error }, { status: 403 }));
    expect(await createTextSource("p1", { title: "T", text: "x" })).toEqual({ ok: false, error });
  });

  const BAD = { ok: false, error: { code: "internal", message: "Something went wrong. Try again." } };

  it("treats a source with an unknown status as a bad response", async () => {
    respondWith(Response.json({ source: { ...source, status: "done" } }));
    expect(await finalizeUpload("p1", "s1")).toEqual(BAD);
  });

  it("treats an upload without a token as a bad response", async () => {
    respondWith(Response.json({ source, upload: { path: "p" } }));
    expect(await createUploadUrl("p1", { fileName: "h.pdf", sizeBytes: 1, mimeType: "application/pdf" })).toEqual(BAD);
  });

  it("a network failure is an internal error", async () => {
    respondWith(new TypeError("Failed to fetch"));
    expect(await deleteSource("s1")).toMatchObject({ ok: false, error: { code: "internal" } });
  });
});
