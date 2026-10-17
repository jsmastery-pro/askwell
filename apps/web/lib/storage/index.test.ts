// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

class FakeCommand {
  input: unknown;
  constructor(input: unknown) {
    this.input = input;
  }
}

const send = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = send;
  },
  PutObjectCommand: class extends FakeCommand {},
  GetObjectCommand: class extends FakeCommand {},
  DeleteObjectCommand: class extends FakeCommand {},
}));

const { deleteKnowledgeFile, knowledgeFileKey, readKnowledgeFile, uploadKnowledgeFile } = await import("./index");

beforeEach(() => {
  vi.stubEnv("STORAGE_ENDPOINT", "https://storage.test");
  vi.stubEnv("STORAGE_REGION", "auto");
  vi.stubEnv("STORAGE_BUCKET", "askwell-test");
  vi.stubEnv("STORAGE_ACCESS_KEY", "key");
  vi.stubEnv("STORAGE_SECRET_KEY", "secret");
});

afterEach(() => {
  send.mockReset();
  vi.unstubAllEnvs();
});

describe("knowledgeFileKey", () => {
  it("never produces a public URL, only a private key", () => {
    const key = knowledgeFileKey("project-1", "source-1");
    expect(key).toBe("projects/project-1/source-1");
    expect(key).not.toMatch(/^https?:\/\//);
  });
});

describe("uploadKnowledgeFile", () => {
  it("puts the object in the configured bucket", async () => {
    send.mockResolvedValue({});
    await uploadKnowledgeFile("projects/p/s", Buffer.from("hello"), "text/plain");
    const sent = send.mock.calls[0]![0] as FakeCommand;
    expect(sent).toMatchObject({ input: { Bucket: "askwell-test", Key: "projects/p/s", ContentType: "text/plain" } });
  });
});

describe("readKnowledgeFile", () => {
  it("returns the object body as a buffer", async () => {
    send.mockResolvedValue({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } });
    const buffer = await readKnowledgeFile("projects/p/s");
    expect(buffer).toEqual(Buffer.from([1, 2, 3]));
  });
});

describe("deleteKnowledgeFile", () => {
  it("deletes the object from the configured bucket", async () => {
    send.mockResolvedValue({});
    await deleteKnowledgeFile("projects/p/s");
    const sent = send.mock.calls[0]![0] as FakeCommand;
    expect(sent).toMatchObject({ input: { Bucket: "askwell-test", Key: "projects/p/s" } });
  });
});

describe("when storage isn't configured", () => {
  it("throws rather than silently no-op", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    const fresh = await import("./index");
    await expect(fresh.uploadKnowledgeFile("k", Buffer.from("x"), "text/plain")).rejects.toThrow(
      "Storage is not configured",
    );
  });
});
