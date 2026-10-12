# UI-T02 — Knowledge screen

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | UI track |
| Needs first | UI-T01 |
| Files allowed | `apps/web/app/dashboard/projects/[id]/knowledge/**`, `apps/web/components/knowledge/**`, `apps/web/lib/data/knowledge.ts`, `apps/web/lib/mock/**` |
| project.md | §6.4 Knowledge, §5 Plans, §9 Security rules (XSS, File upload) |
| See | `docs/ui-track.md` (rules) |

## Goal
The full Knowledge tab: source list with status, add text, upload a file, delete. Data is mocked.

## Steps
1. List the project's sources, newest first: title, type, status badge (`processing` / `ready` / `failed`), date. A failed source shows a short reason and a "Try again" action (mocked).
2. "Add text": title + content form, validated with `addTextKnowledgeRequestSchema`.
3. "Upload file": PDF/MD/TXT only, up to `MAX_KNOWLEDGE_FILE_BYTES`. Show a clear error for a wrong type or size before "uploading". Drag-and-drop plus a file picker.
4. Plan limit: "N of M files" from `PLAN_LIMITS` (real plan). At the limit, the upload is disabled with an upgrade link to Billing.
5. Delete with a confirm dialog.
6. Mocked actions update local state. A new source shows `processing` and flips to `ready` after a short delay, so the status UI can be seen working.
7. Empty state that explains what Knowledge is for.
8. Tests: a title with `<img onerror>` renders as text; a wrong type and an oversized file are rejected; at the limit the upload is disabled; delete removes the row.

## Done when
- [ ] Every action (add text, upload, delete, retry) works on mock data, with visible status changes
- [ ] Type, size and plan-limit errors show before anything is "sent"
- [ ] Titles render as text (test)
- [ ] Usable at 375 px wide
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Later wiring: P3-T02 (ingest) and P3-T03 (delete) replace the `MOCK:` functions in `lib/data/knowledge.ts`. Keep the function signatures close to those routes' shared types.
