# P3-T02 — Knowledge ingest

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P3-T01, P2-T02 |
| Files allowed | `apps/web/app/api/projects/[id]/knowledge/**`, `apps/web/lib/knowledge/**`, `apps/web/lib/storage/**`, `apps/web/package.json`, `pnpm-lock.yaml` |
| project.md | §6.4 Knowledge, §5 Plans, §7 Data model, §9 Security rules (File upload, Tenant leak, Plan bypass) |

## Goal
`POST /api/projects/:id/knowledge` accepts pasted text or a PDF/MD/TXT file, stores it, and turns it into embedded chunks in the background.

## Steps
1. Load the project through `getOwnedProject`. `null` → `404`.
2. Two inputs (schemas in `packages/shared`): JSON pasted text, or multipart `file` + optional title.
3. Files: check extension against `KNOWLEDGE_FILE_TYPES` and size against `MAX_KNOWLEDGE_FILE_BYTES` on the server. For PDF also check the `%PDF-` magic bytes. Reject with `400`.
4. File limit: read the owner's plan on the server; count the project's file sources (pasted text doesn't count); over `PLAN_LIMITS[plan].knowledgeFilesPerProject` → `403` `plan_limit`.
5. `apps/web/lib/storage`: S3-compatible client from `STORAGE_*`. Upload to a private key like `projects/<projectId>/<sourceId>`. Never a public URL.
6. Insert `knowledge_sources` with status `processing` and respond `201` immediately.
7. In Next's `after()`: extract text (`unpdf` for PDF, raw for MD/TXT/pasted), chunk with `CHUNKING`, `embedTexts`, insert `knowledge_chunks` with the project ID, then set status `ready`. Any error → status `failed`, logged.
8. Tests: other owner's project → `404`; wrong type / too big / fake PDF → `400`; 4th file on Free → `403`; processing with mocked storage + OpenAI creates chunks and sets `ready`; an extraction error sets `failed`.

## Done when
- [ ] Uploading a real PDF ends with status `ready` and chunks in `knowledge_chunks`
- [ ] Pasted text also produces chunks
- [ ] A renamed `.exe` → `400`; an 11 MB file → `400`
- [ ] 4th file on Free → `403` `plan_limit`
- [ ] Uploaded files are not reachable by a public URL
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Knowledge DB reads/writes live in `apps/web/lib/knowledge` (use the `@askwell/db/client` instance). Don't edit `packages/db` — P3-T04 owns `packages/db/queries` this phase.
- New deps (`unpdf`, an S3 client) are fine; name them in the PR body. If another open PR also touches `apps/web/package.json` / `pnpm-lock.yaml`: merge main, keep both, `pnpm install`.
- Chunk text is data. Never interpret it.
