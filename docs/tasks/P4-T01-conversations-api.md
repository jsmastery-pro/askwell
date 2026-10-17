# P4-T01 — Conversations API + wiring

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P1-T02, P2-T02 |
| Files allowed | `apps/web/app/api/projects/[id]/conversations/**`, `apps/web/app/api/conversations/[id]/**`, `apps/web/lib/conversations/**`, `apps/web/lib/data/conversations.ts`, `apps/web/lib/data/conversations.test.ts`, `apps/web/lib/data/mocks.test.ts`, `apps/web/lib/data/real.test.ts`, `apps/web/app/dashboard/projects/[id]/conversations/[conversationId]/page.test.tsx` |
| project.md | §6.7 Conversations, §8 API routes (Owner), §9 Security rules (Tenant leak, XSS) |

## Goal
The owner reads real conversations. UI-T03 already built the list and thread screens against mock data (`apps/web/app/dashboard/projects/[id]/conversations/**`, `apps/web/components/conversations/**`) — **don't touch those**. This task only adds the two read routes and replaces the `MOCK:` functions behind them.

## Steps
1. `GET /api/projects/:id/conversations`: load the project through `getOwnedProject`. Not owned → `404`. Return the project's conversations, newest first, with first visitor message preview, message count, and `createdAt` (matches `ListConversationsResponse` / `ConversationSummary` in `packages/shared`).
2. `GET /api/conversations/:id`: load the conversation, then its project through `getOwnedProject`. Not owned or unknown → `404`. Return the full thread, visitor vs. bot, in order (`GetConversationResponse`).
3. `apps/web/lib/conversations/`: the DB reads behind both routes (new module — don't put these in `apps/web/lib/chat`, which P3-T05 owns for the chat route's writes; this is read-only and owner-facing).
4. `lib/data/conversations.ts`: replace `listConversations`/`getConversation`'s `MOCK:` bodies with real reads (follow the pattern in `lib/data/usage.ts` — the calling pages already run `getOwnedProject` first, so these don't re-check ownership).
5. Tests: another owner's project/conversation → `404`; list is newest first; thread order is correct; a message body containing `<img onerror>` round-trips as plain text (rendering as text is the page's job, already done — just confirm the data layer doesn't transform it).

## Done when
- [ ] List and thread show real data once a conversation exists in the DB (seed one directly in a test or via `drizzle` insert — P3-T05's chat route isn't required to land first)
- [ ] Owner A can't read owner B's conversations or a single thread (`404`)
- [ ] `grep -rn "MOCK:" apps/web/lib/data/conversations.ts` returns nothing
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- No new table or schema change — `conversations`/`messages` already exist (P1-T01).
- `packages/shared`'s conversation types already exist (P1-T03); don't redefine them.
- Phase 4's "a widget chat appears in Conversations after refresh" end-to-end check needs P3-T05 (chat route) merged too — that's not blocking this task, just the phase's overall done-when.
