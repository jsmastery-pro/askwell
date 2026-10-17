# P4-T02 — Owner analytics wiring (dashboard home)

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P4-T01 |
| Files allowed | `apps/web/lib/data/analytics.ts`, `apps/web/lib/data/analytics.test.ts`, `apps/web/lib/mock/analytics.ts` |
| project.md | §6.12 Usage, §7 Data model, §9 Security rules (Tenant leak) |

## Background
UI-T08 built `/dashboard`'s home (stat cards, messages-per-day chart, recent chats) against mock data. The plan/project-count/usage parts are already real (`lib/data/usage.ts`). This task replaces the two remaining `// MOCK:` functions in `lib/data/analytics.ts` — `mockDailyMessages` and `mockRecentChats` — with real queries over `messages`/`conversations`, now that both are real (P4-T01). This is **not** §6.11 PostHog analytics (that's Alice's Phase 4 Lane B) — this is the owner-facing dashboard built on our own tables.

## Steps
1. `getDashboard(ownerId, range, now, database)`: replace the mocked daily/recent-chat calls with real aggregates, scoped to this owner's projects only (join `messages` → `conversations` → `projects`, filter `projects.owner_id`).
2. **Daily messages**: one row per UTC day in the range (zero-filled for days with none), summed across the owner's projects. Prefer a grouped SQL count over loading every message row — same reasoning as the P4-T01 CodeRabbit fix (aggregate in the DB, not in JS).
3. **Current/previous totals**: `messages` (sum of daily), `conversations` (distinct conversations with at least one message in the period), `visitors` (distinct `visitor_id` across those conversations). The previous period is the same length immediately before the range.
4. **Recent chats**: the 5 newest conversations across the owner's projects (by their latest message, or conversation `createdAt` if that's simpler and still correct), with the project name, the first visitor message as preview, and timestamp.
5. Delete `lib/mock/analytics.ts` and its test coverage once nothing references it — check first (`grep -rn "lib/mock/analytics"`). Leave `lib/mock/conversations.ts` alone; it's still used by `mocks.test.ts`'s HTML-rendering test and the conversations page test.
6. Rewrite `analytics.test.ts` against a real pglite DB (same pattern as `conversations.test.ts`/`usage.ts`'s tests): seed real conversations/messages instead of relying on `MOCK_THREADS`. The existing "demo volume in proportion to the plan limit" test is specific to the fake heuristic — replace it with an assertion that real counts are exactly right, not proportional.
7. Keep the empty-state behavior: a project with no conversations yet shows zero activity; an owner with no projects gets an empty dashboard.

## Done when
- [ ] Daily messages, current/previous totals, and recent chats are all real, scoped to one owner's own projects
- [ ] A different owner's messages/conversations never appear in another owner's dashboard (test proves it)
- [ ] `grep -rn "MOCK:" apps/web/lib/data/analytics.ts` returns nothing
- [ ] `grep -rn "lib/mock/analytics" apps/web` returns nothing (file removed)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- No new route, table, or `packages/shared` change — every number comes from `messages.created_at`, `conversations.visitor_id`/`project_id`, already in the schema.
- Don't touch the dashboard-home page or its components — this is a `lib/data` wiring task only, same split as P3-T03/P4-T01.
- Don't add an "unanswered questions" or answer-quality metric (project.md §12 — nothing in the data model stores it).
