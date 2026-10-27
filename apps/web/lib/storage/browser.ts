// Browser-only: the publishable key is public by design (project.md §9) — RLS and the signed
// URL's one-time token are the real boundary, not this key. Never imported by apps/widget.
import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | undefined;

function getClient() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) {
      throw new Error(
        "Storage is not configured (missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
      );
    }
    // Never signs anyone in: this client only ever makes the one signed-upload call below, so
    // there's no session to persist or refresh.
    client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

/** Uploads straight to Storage using the one-time signed URL from our upload-url route (SB-T06). */
export async function uploadKnowledgeFileToSignedUrl(
  path: string,
  token: string,
  file: File,
  contentType?: string,
): Promise<void> {
  const { error } = await getClient()
    .storage.from("knowledge")
    .uploadToSignedUrl(path, token, file, contentType ? { contentType } : undefined);
  if (error) throw error;
}
