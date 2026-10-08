# P3-T03 — Delete source + Knowledge page

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P3-T02, P2-T04 |
| Files allowed | `apps/web/app/api/knowledge/**`, `apps/web/app/dashboard/projects/[id]/knowledge/**`, `apps/web/components/knowledge/**`, `apps/web/lib/knowledge/**` |
| project.md | §6.4 Knowledge, §8 API routes (Owner), §9 Security rules (Tenant leak, XSS) |

## Goal
Owners see their sources with status, add text or files, and delete a source along with its file and chunks.

## Steps
1. `DELETE /api/knowledge/:id`: load the source, then its project through `getOwnedProject`. Not owned → `404`. Delete the storage object (if any), then the row (chunks cascade).
2. A list endpoint or server-side load for the page — the project's sources, newest first, scoped through `getOwnedProject`.
3. `/dashboard/projects/[id]/knowledge`: list with status badges (`processing`, `ready`, `failed`), a paste-text form, a file upload, and delete with confirm. Poll or refresh while any source is `processing`.
4. Show the plan-limit message on `403`.
5. Add a "Knowledge" link from the project's pages.
6. Tests: delete another owner's source → `404`; delete removes the storage object and chunks.

## Done when
- [ ] Upload from the page → status goes `processing` → `ready` without a manual reload
- [ ] Delete removes the row, its chunks, and its stored file
- [ ] Owner A can't delete owner B's source (`404`)
- [ ] Titles render as text
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Reuse components from `apps/web/components`; new ones in `components/knowledge/`.
- If deleting the storage object fails, still delete the row and log it. Orphan files are better than orphan chunks.
