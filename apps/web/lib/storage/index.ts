// Server-only: credentials never ship to the client.
import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let client: S3Client | undefined;

// InstaCloud's names for a bound storage service (`insta secrets bind … storage/<name> --to compute/<app>`).
const ENV = {
  endpoint: "AWS_ENDPOINT_URL_S3",
  region: "AWS_REGION",
  accessKeyId: "AWS_ACCESS_KEY_ID",
  secretAccessKey: "AWS_SECRET_ACCESS_KEY",
  bucket: "BUCKET_NAME",
} as const;

function getClient(): S3Client {
  if (!client) {
    const endpoint = process.env[ENV.endpoint];
    const region = process.env[ENV.region];
    const accessKeyId = process.env[ENV.accessKeyId];
    const secretAccessKey = process.env[ENV.secretAccessKey];
    if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
      const missing = Object.values(ENV).filter((name) => name !== ENV.bucket && !process.env[name]);
      throw new Error(`Storage is not configured (missing ${missing.join(", ")})`);
    }
    // The endpoint is required: without it the SDK talks to real AWS.
    client = new S3Client({ endpoint, region, credentials: { accessKeyId, secretAccessKey } });
  }
  return client;
}

function bucket(): string {
  const value = process.env[ENV.bucket];
  if (!value) throw new Error(`${ENV.bucket} is not set`);
  return value;
}

/** Private key for a knowledge file. Never a public URL (project.md §9). */
export function knowledgeFileKey(projectId: string, sourceId: string): string {
  return `projects/${projectId}/${sourceId}`;
}

export async function uploadKnowledgeFile(key: string, body: Buffer, contentType: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function readKnowledgeFile(key: string): Promise<Buffer> {
  const response = await getClient().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Empty storage object for key ${key}`);
  return Buffer.from(bytes);
}

/** Used when a source is deleted (P3-T03). Caller decides how to handle a failure. */
export async function deleteKnowledgeFile(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
