// The browser's only Supabase use: putting a file into the private knowledge
// bucket with the one-time signed upload from upload-url. Publishable key and
// no session: the signed token is the only permission (§3 File storage). The
// file goes straight to Storage, never through our routes (Vercel's 4.5 MB cap).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CreateUploadUrlResponse } from "@askwell/shared";
import { supabasePublicEnv } from "../../lib/supabase/env";
import type { ApiResult } from "../projects/api";

export const KNOWLEDGE_BUCKET = "knowledge";

let client: SupabaseClient | undefined;

function storageClient(): SupabaseClient {
  if (!client) {
    const { url, publishableKey } = supabasePublicEnv();
    client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

/** Uploads `file` to the signed path. A Storage refusal comes back as an `internal` failure. */
export async function putSignedUpload(
  upload: CreateUploadUrlResponse["upload"],
  file: Blob,
  contentType: string,
): Promise<ApiResult<null>> {
  try {
    const { error } = await storageClient()
      .storage.from(KNOWLEDGE_BUCKET)
      .uploadToSignedUrl(upload.path, upload.token, file, { contentType });
    if (!error) return { ok: true, data: null };
  } catch {
    // Network failure or missing env: same message as a refusal.
  }
  return { ok: false, error: { code: "internal", message: "The file upload failed." } };
}
