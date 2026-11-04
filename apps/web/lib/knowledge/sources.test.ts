import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";

// "server-only" throws outside a React Server Components build; stub it.
vi.mock("server-only", () => ({}));

const { checkTextSize, checkUploadedFile, isMissingObject, MAX_CHUNKS_PER_SOURCE, newStorageKey, toKnowledgeSource } =
  await import("./sources");

const PROJECT = "11111111-1111-4111-8111-111111111111";
const ascii = (text: string) => new TextEncoder().encode(text);

describe("checkUploadedFile", () => {
  it("accepts a PDF that starts with %PDF-, and any non-empty MD/TXT", () => {
    expect(checkUploadedFile(ascii("%PDF-1.7\n…"), "pdf")).toBeNull();
    expect(checkUploadedFile(ascii("# Title"), "md")).toBeNull();
    expect(checkUploadedFile(ascii("hello"), "txt")).toBeNull();
  });

  it("refuses a .pdf without the magic bytes (e.g. a renamed .exe)", () => {
    expect(checkUploadedFile(ascii("MZ\x90\x00"), "pdf")).toBe("That file isn't a PDF.");
    expect(checkUploadedFile(ascii("%PDF"), "pdf")).toBe("That file isn't a PDF.");
    expect(checkUploadedFile(ascii(" %PDF-1.4"), "pdf")).toBe("That file isn't a PDF.");
  });

  it("refuses empty and over-10 MB files, and allows exactly 10 MB", () => {
    expect(checkUploadedFile(new Uint8Array(), "txt")).toBe("The uploaded file is empty.");
    expect(checkUploadedFile(new Uint8Array(MAX_KNOWLEDGE_FILE_BYTES + 1), "txt")).toBe("The uploaded file is over 10 MB.");
    expect(checkUploadedFile(new Uint8Array(MAX_KNOWLEDGE_FILE_BYTES), "txt")).toBeNull();
  });
});

describe("checkTextSize", () => {
  it("allows text up to MAX_CHUNKS_PER_SOURCE chunks and refuses more", () => {
    expect(checkTextSize("A short FAQ.")).toBeNull();
    expect(checkTextSize("word ".repeat(MAX_CHUNKS_PER_SOURCE * 400))).toMatch(/too much text/);
  });
});

describe("newStorageKey", () => {
  it("is <projectId>/<uuid>.<ext>, and unique", () => {
    const key = newStorageKey(PROJECT, "md");
    expect(key).toMatch(new RegExp(`^${PROJECT}/[0-9a-f-]{36}\\.md$`));
    expect(newStorageKey(PROJECT, "md")).not.toBe(key);
  });
});

describe("isMissingObject", () => {
  it.each([
    ["HTTP 404", { status: 404 }],
    ["HTTP 400 with statusCode 404 (older Storage API)", { status: 400, statusCode: "404" }],
    ["NoSuchKey", { status: 400, statusCode: "400", code: "NoSuchKey" }],
  ])("%s is a missing object", (_label, error) => {
    expect(isMissingObject(error)).toBe(true);
  });

  it.each([
    ["HTTP 400 for another reason", { status: 400, statusCode: "400", code: "InvalidRequest" }],
    ["HTTP 500", { status: 500, statusCode: "500" }],
  ])("%s is not", (_label, error) => {
    expect(isMissingObject(error)).toBe(false);
  });
});

describe("toKnowledgeSource", () => {
  const row = {
    id: "s1",
    project_id: PROJECT,
    title: "T",
    type: "pdf",
    storage_key: "k",
    status: "uploading",
    created_at: "2026-11-04T12:00:00Z",
  };

  it("narrows type and status to the shared enums", () => {
    expect(toKnowledgeSource(row)).toEqual(row);
  });

  it("refuses a value outside them", () => {
    expect(() => toKnowledgeSource({ ...row, status: "done" })).toThrow(/Unknown source type or status/);
  });
});
