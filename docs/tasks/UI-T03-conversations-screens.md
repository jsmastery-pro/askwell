# UI-T03 — Conversations screens

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | UI track |
| Needs first | UI-T01 |
| Files allowed | `apps/web/app/dashboard/projects/[id]/conversations/**`, `apps/web/components/conversations/**`, `apps/web/lib/data/conversations.ts`, `apps/web/lib/mock/**`, `apps/web/components/knowledge/**` (follow-ups only) |
| project.md | §6.7 Conversations, §9 Security rules (XSS, Tenant leak) |
| See | `docs/ui-track.md` (rules) |

## Goal
The conversation list and the thread view. Data is mocked.

## Steps
1. List, newest first: first-message preview (truncated), message count, relative time, a short visitor ID.
2. Thread view `/conversations/[conversationId]`: the full history, visitor vs. bot clearly styled, timestamps, and a back link.
3. A manual "Refresh" button (no realtime, per §6.7).
4. An unknown conversation ID, or one from another project → 404.
5. Empty state that points to Install ("No chats yet. Add the widget to your site.").
6. **Carried over from #38 (CodeRabbit, merged before they were fixed)**, in `components/knowledge/`:
   - `ConfirmDelete`: trap Tab and Shift+Tab inside the dialog (or set `inert` on the content behind it).
   - `KnowledgeManager` `retry`: catch a rejected action and show an error, like `remove` does.
   - `KnowledgeManager`: the upgrade message reads `PLAN_LIMITS.pro.knowledgeFilesPerProject` instead of a hardcoded "25".
   Add a test for each, and reply on the three #38 threads with the fix commit.
7. Tests: message bodies with HTML render as text; the list is newest first; another project's conversation → 404.

## Done when
- [ ] The list and the thread work on mock data; Refresh re-loads
- [ ] The three #38 follow-ups are fixed, with tests
- [ ] Message text renders as text (test)
- [ ] Usable at 375 px wide
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Later wiring: Phase 4 Lane A replaces the `MOCK:` functions with `GET /api/projects/:id/conversations` and `GET /api/conversations/:id`.
