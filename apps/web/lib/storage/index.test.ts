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
const clientConfig = vi.hoisted(() => ({ last: undefined as unknown }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = send;
    constructor(config: unknown) {
      clientConfig.last = config;
    }
  },
  PutObjectCommand: class extends FakeCommand {},
  GetObjectCommand: class extends FakeCommand {},
  DeleteObjectCommand: class extends FakeCommand {},
}));

const { deleteKnowledgeFile, knowledgeFileKey, readKnowledgeFile, uploadKnowledgeFile } = await import("./index");

// The names InstaCloud injects for a bound storage service.
const BOUND = {
  AWS_ENDPOINT_URL_S3: "https://storage.test",
  AWS_REGION: "auto",
  BUCKET_NAME: "askwell-test",
  AWS_ACCESS_KEY_ID: "key",
  AWS_SECRET_ACCESS_KEY: "secret",
};

function stubBound(overrides: Partial<Record<keyof typeof BOUND, string>> = {}) {
  for (const [name, value] of Object.entries({ ...BOUND, ...overrides })) vi.stubEnv(name, value);
}

beforeEach(() => stubBound());

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

describe("configuration", () => {
  async function fresh() {
    vi.resetModules();
    return import("./index");
  }

  it("builds the client from InstaCloud's bound names, with the endpoint set explicitly", async () => {
    send.mockResolvedValue({});
    await (await fresh()).uploadKnowledgeFile("k", Buffer.from("x"), "text/plain");
    expect(clientConfig.last).toEqual({
      endpoint: "https://storage.test",
      region: "auto",
      credentials: { accessKeyId: "key", secretAccessKey: "secret" },
    });
  });

  it("throws, naming what's missing, rather than silently no-op", async () => {
    stubBound({ AWS_ENDPOINT_URL_S3: "", AWS_SECRET_ACCESS_KEY: "" });
    await expect((await fresh()).uploadKnowledgeFile("k", Buffer.from("x"), "text/plain")).rejects.toThrow(
      "Storage is not configured (missing AWS_ENDPOINT_URL_S3, AWS_SECRET_ACCESS_KEY)",
    );
  });

  it("throws when BUCKET_NAME is missing", async () => {
    stubBound({ BUCKET_NAME: "" });
    await expect((await fresh()).deleteKnowledgeFile("k")).rejects.toThrow("BUCKET_NAME is not set");
  });
});
