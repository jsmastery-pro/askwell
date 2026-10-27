# SB-T06 — Storage on `supabase-js` with direct signed uploads; 10 MB again

| Field | Value |
|---|---|
| Owner | Alice |
| Track | Supabase-native |
| Needs first | SB-T03 (`reserve_knowledge_source`); SB-T04's `createServiceClient()` (see Notes) |
| Files allowed | `supabase/migrations/**` (new migration: bucket + storage policies), `apps/web/lib/storage/**`, `apps/web/app/api/projects/[id]/knowledge/**` (new upload-URL and finalize routes), `apps/web/components/knowledge/**`, `apps/web/lib/data/knowledge-actions.ts` and its test (the client's upload calls), `packages/shared/src/knowledge.ts` (back to 10 MB), `apps/web/components/landing/Hero.tsx` and `docs/askwell-knowledge.md` (size wording), co-located tests |
| project.md | §6.4, §9 File upload |

## Why
Product owner, 2026-10-27: uploads go straight from the browser to Supabase Storage with a signed URL, so Vercel's 4.5 MB body limit no longer applies, and the limit returns to **10 MB**.

## Steps
1. **Migration:** a **private** bucket `knowledge`, created in the migration (so prod gets it too), with Supabase's bucket limits set: `file_size_limit` 10 MB and `allowed_mime_types` for PDF, Markdown and text. No public access and no storage policies for `anon` or `authenticated`. Signed URLs are the only way in. The old `askwell` bucket's objects are throwaway; don't migrate them.
2. **Upload flow:**
   1. The client asks our route for an upload URL. The server checks the owner, the extension, the declared size (≤ 10 MB) and the plan limit, then reserves the source with `rpc("reserve_knowledge_source")` (it inserts the source as `processing`; pass `p_source_id`, because the storage key `projects/<projectId>/<sourceId>` contains it) and returns `createSignedUploadUrl(path)`.
   2. The browser uploads straight to Supabase.
   3. The client calls our **finalize** route. The server checks the object's **real** size and the PDF magic bytes, deleting the object and the source if either fails, then starts processing.
3. **Abandoned uploads** (a reservation that never finalizes) must not use up the limit forever. Give it an expiry, or clean it up, and explain your choice. Don't add a new `source_status` value unless you need it; if you do, it's an additive `ALTER TYPE … ADD VALUE` in your migration, and say why in the PR.
4. Pasted text keeps the JSON route, with the same shared limit.
5. Delete removes the object through `supabase-js`.
6. Every "4 MB" goes back to "10 MB", built from `MAX_KNOWLEDGE_FILE_BYTES`. Remove the AWS SDK from storage.

## Done when
- [ ] On the PR's Vercel preview, a 9 MB PDF uploads directly and reaches `ready` (once SB-T07 lands; until then, the object exists and the source is reserved)
- [ ] An 11 MB file is refused, a fake PDF is refused and cleaned up, and the 4th source on Free is refused
- [ ] Deleting removes the object
- [ ] Unsigned access to the bucket is refused
- [ ] Checks pass

## Notes
- CodeRabbit is required (file upload, `packages/shared`).
- Bob is building `apps/web/lib/supabase/` in SB-T04. Import the service client as `createServiceClient()` from `@/lib/supabase/service`, and don't edit that folder. Until SB-T04 merges, mock it in tests and rebase when it lands; the PR opens after SB-T04 merges.
- No local Supabase stack. The bucket and its limits are checked on dev after merge.
