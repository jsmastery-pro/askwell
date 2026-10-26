# MV-T04 — Storage on Supabase; uploads up to 4 MB

| Field | Value |
|---|---|
| Owner | Bob |
| Track | Platform move |
| Needs first | MV-T01 step 1 (dev bucket and S3 keys) for the live check |
| Files allowed | `apps/web/lib/storage/**`, `packages/shared/src/knowledge.ts` (the size constant), `apps/web/components/knowledge/**` (size wording only), `docs/askwell-knowledge.md` and `apps/web/components/landing/askwell-knowledge.test.ts` (size wording), `.env.example` (storage comments), plus co-located tests |
| project.md | §6.4 Knowledge, §9 File upload, §11 |

## Why
- **Storage:** Supabase Storage speaks the S3 protocol, so `lib/storage` keeps its S3 client and env names (`AWS_*`, `BUCKET_NAME`). Only the values change.
- **Upload size (product owner, 2026-10-26):** Vercel caps request bodies at 4.5 MB, so the upload limit drops from 10 MB to **4 MB**.

## Steps
1. **S3 client:** works against Supabase's S3 endpoint. Supabase requires `forcePathStyle: true`, which #75 removed. Follow Supabase's S3 docs for the region value.
2. **Upload limit:** `MAX_KNOWLEDGE_FILE_BYTES` becomes 4 MB. The early `Content-Length` check (from #80) must fit under Vercel's 4.5 MB body limit, including multipart overhead.
3. **Wording:** every "10 MB" becomes "4 MB": the Knowledge page, error messages, and `docs/askwell-knowledge.md` (keep its guard test in sync).
4. **Bucket privacy:** the bucket stays private. No public URLs are ever returned (§9).

## Done when
- [ ] Against dev Supabase: a PDF under 4 MB uploads, reaches `ready`, and deleting it removes the object
- [ ] A 4.2 MB file is refused with our own 413, not Vercel's raw error
- [ ] `grep -rn "10 MB" apps docs/askwell-knowledge.md` finds nothing
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- CodeRabbit is required (`packages/shared`, file upload).
