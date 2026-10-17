// Server-only: credentials never ship to the client.
import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    const endpoint = process.env.STORAGE_ENDPOINT;
    const region = process.env.STORAGE_REGION;
    const accessKeyId = process.env.STORAGE_ACCESS_KEY;
    const secretAccessKey = process.env.STORAGE_SECRET_KEY;
    if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
      throw new Error("Storage is not configured");
    }
    client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }
  return client;
}

function bucket(): string {
  const value = process.env.STORAGE_BUCKET;
  if (!value) throw new Error("STORAGE_BUCKET is not set");
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
