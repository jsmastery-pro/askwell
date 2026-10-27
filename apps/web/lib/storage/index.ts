// Server-only: the service key never ships to the client (SB-T06: supabase-js Storage, not the
// AWS SDK — the `knowledge` bucket and its limits are set in supabase/migrations).
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "knowledge";

/** Private key for a knowledge file. Never a public URL (project.md §9). */
export function knowledgeFileKey(projectId: string, sourceId: string): string {
  return `projects/${projectId}/${sourceId}`;
}

/** A one-time signed URL; the browser uploads straight to Storage with it, bypassing our server. */
export async function createKnowledgeUploadUrl(key: string): Promise<{ path: string; token: string }> {
  const { data, error } = await createServiceClient().storage.from(BUCKET).createSignedUploadUrl(key);
  if (error) throw error;
  return { path: data.path, token: data.token };
}

/** The uploaded object's bytes, for finalize's real-size and PDF-magic-byte checks. */
export async function readKnowledgeFile(key: string): Promise<Buffer> {
  const { data, error } = await createServiceClient().storage.from(BUCKET).download(key);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

/** Used when a source is deleted, or an upload is refused or abandoned. */
export async function deleteKnowledgeFile(key: string): Promise<void> {
  const { error } = await createServiceClient().storage.from(BUCKET).remove([key]);
  if (error) throw error;
}
