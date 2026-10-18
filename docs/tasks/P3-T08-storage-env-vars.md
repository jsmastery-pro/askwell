# P3-T08 — Read InstaCloud's storage env vars

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P3-T02 |
| Files allowed | `apps/web/lib/storage/**`, `.env.example` |
| project.md | §6.4 Knowledge, §11 Environment variables |

## Why
`apps/web/lib/storage` reads `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY`. A storage bucket bound to an InstaCloud environment provides `AWS_*` variables and `BUCKET_NAME` instead. So every file upload fails with "Storage is not configured" on any environment that uses the bound bucket, `main` included. Found by Bob while testing P3-T06 (#74). Product owner decision, 2026-10-18: read InstaCloud's names, so no environment needs manual storage setup.

## Steps
1. On your `bob` branch, list the storage variable **names** InstaCloud binds (never print values). Use exactly those names.
2. `lib/storage`: read the bound names instead of `STORAGE_*`. Drop the `STORAGE_*` names completely, with no fallback to both. The bucket stays private; uploads still never get a public URL.
3. `.env.example`: replace the five `STORAGE_*` lines with the bound names, blank values, and a one-line comment saying InstaCloud provides them when a bucket is bound.
4. Tests: the client builds from the new names; a missing variable gives the same clear "not configured" error as today.

## Done when
- [ ] On the `bob` deploy, with no manual storage variables, a PDF upload reaches `ready`, and deleting it removes the stored file
- [ ] `grep -rn "STORAGE_" apps packages .env.example` returns nothing
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Put the exact variable names in the PR body. John updates `project.md` §11 from it.
- CodeRabbit is required: this touches file upload, which §9 covers.
