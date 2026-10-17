# P3-T03 — Delete source + wire the Knowledge screen

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P3-T02, P2-T04 |
| Files allowed | `apps/web/app/api/knowledge/**`, `apps/web/lib/data/knowledge.ts`, `apps/web/lib/data/knowledge-actions.ts`, `apps/web/lib/knowledge/**`, `apps/web/lib/data/mocks.test.ts`, `apps/web/lib/data/real.test.ts`, `apps/web/components/knowledge/KnowledgeManager.tsx` |
| project.md | §6.4 Knowledge, §8 API routes (Owner), §9 Security rules (Tenant leak, XSS) |

## Trimmed 2026-10-17 (John)
UI-T02 already built the full Knowledge screen (list, status badges, add text, upload, delete, empty state) against mock data at `apps/web/app/dashboard/projects/[id]/knowledge/**` and `apps/web/components/knowledge/**`. The Overview-page placeholder link (originally step 6) was also already resolved by UI-T08. **Don't touch either** — this task only replaces the `// MOCK:` function bodies in `lib/data/knowledge.ts` and `lib/data/knowledge-actions.ts`, plus adds the one missing route. The screen doesn't change.

## Updated 2026-10-17 (John) — two scope additions
1. **Tests**: `lib/data/mocks.test.ts` asserts the old mock behavior for the knowledge functions; once they're real, move those cases to `lib/data/real.test.ts` (same split already used for billing/config). Both files added to "Files allowed" above.
2. **Retry**: `retryKnowledgeSource` has no spec'd backend (project.md §6.4/§8 never mention a retry/re-ingest route), and a failed text source's content isn't recoverable anyway. Don't build a route for it. Instead remove `retryKnowledgeSource` from `knowledge-actions.ts` and remove the "Try again" button/handler from `KnowledgeManager.tsx` — that component is now in "Files allowed", scoped to this one removal only, not a redesign.

## Goal
Real data and real writes behind the existing Knowledge screen: list sources, count files toward the plan limit, add text/file, and delete a source along with its file and chunks.

## Steps
1. `DELETE /api/knowledge/:id`: load the source, then its project through `getOwnedProject`. Not owned → `404`. Delete the storage object (if any) via `apps/web/lib/storage`, then the row (chunks cascade).
2. `lib/data/knowledge.ts` — replace the two `MOCK:` functions with real Drizzle queries (follow the pattern in `lib/data/usage.ts`, which already queries the DB directly): `listKnowledgeSources(projectId)` → the project's `knowledge_sources`, newest first; `countKnowledgeFiles(projectId)` → count of that project's non-text sources. The calling pages already run `getOwnedProject` first, so these don't need to re-check ownership.
3. `lib/data/knowledge-actions.ts` — replace the `MOCK:` functions with real calls: `addTextKnowledge` and `addFileKnowledge` → `POST /api/projects/:id/knowledge` (JSON and multipart respectively, from P3-T02). `deleteKnowledgeSource` → the new `DELETE /api/knowledge/:id`.
4. `retryKnowledgeSource`: there's no re-ingest route in project.md §8. Remove it and the "Try again" UI action it backs in `KnowledgeManager`, rather than leaving a mock with no real path — raise it with the product owner if retry is wanted, don't invent a route.
5. Tests: delete another owner's source → `404`; delete removes the storage object and chunks; `listKnowledgeSources`/`countKnowledgeFiles` are scoped per project (a closer/other project's source never comes back).

## Done when
- [ ] Upload from the Knowledge page → status goes `processing` → `ready` on refresh, with no mock data left
- [ ] Delete removes the row, its chunks, and its stored file
- [ ] Owner A can't delete owner B's source (`404`)
- [ ] `grep -rn "MOCK:" apps/web/lib/data/knowledge*.ts` returns nothing
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- If deleting the storage object fails, still delete the row and log it. Orphan files are better than orphan chunks.
- Don't edit the page/components files — they're UI-T02's and already match the real types.
