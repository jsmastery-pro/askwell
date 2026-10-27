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
    client = createClient(url, publishableKey);
  }
  return client;
}

/** Uploads straight to Storage using the one-time signed URL from our upload-url route (SB-T06). */
export async function uploadKnowledgeFileToSignedUrl(path: string, token: string, file: File): Promise<void> {
  const { error } = await getClient().storage.from("knowledge").uploadToSignedUrl(path, token, file);
  if (error) throw error;
}
