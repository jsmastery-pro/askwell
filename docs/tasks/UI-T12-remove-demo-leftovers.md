# UI-T12 — Remove demo leftovers

| Field | Value |
|---|---|
| Owner | Alice if her session is back, otherwise Bob after P3-T06 |
| Lane | UI track (cleanup) |
| Needs first | P3-T05 merged (#72) |
| Files allowed | `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/projects/[id]/page.tsx`, `apps/web/app/dashboard/projects/[id]/conversations/page.tsx`, `apps/web/app/dashboard/projects/[id]/conversations/[conversationId]/page.tsx`, `apps/web/app/dashboard/projects/[id]/knowledge/page.tsx`, `apps/web/components/customize/CustomizeForm.tsx`, `apps/web/components/ui/DemoBadge*`, `apps/web/lib/data/demo.ts`, `apps/web/lib/mock/knowledge.ts`, plus the co-located tests of those files |
| project.md | §6.7 Conversations, §6.4 Knowledge, §6.8 Customize |
| See | `docs/ui-track.md` |

## Why
The UI track marked every screen showing mock data with a "Demo data" badge. The wiring tasks (P3-T03, P4-T01, P4-T02, P5-T03) replaced the data, but their file scope left the pages alone, so the badges stayed. Every dashboard screen now shows real data. The only mock left is the widget panel's reply (`apps/web/app/embed/reply.ts`), which P3-T06 replaces. Found by Bob during #72.

## Steps
1. Remove `<DemoBadge />` from the 6 files listed above.
2. Delete the `DemoBadge` component once nothing renders it.
3. Delete `apps/web/lib/data/demo.ts` (nothing imports `demoDelay` anymore).
4. Delete `apps/web/lib/mock/knowledge.ts` if nothing imports it. Check first with `grep -rn "mock/knowledge" apps/web`.
5. Leave `apps/web/lib/mock/conversations.ts` alone. `mocks.test.ts` and the conversation page test still use it as a fixture.
6. Update any test that asserts the badge is shown.

## Done when
- [ ] `grep -rn "DemoBadge" apps/web` returns nothing
- [ ] No page shows "Demo data"
- [ ] `lib/data/demo.ts` is gone, and `lib/mock/knowledge.ts` too if it was unused
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- UI-only cleanup. CodeRabbit isn't required; it merges on John's review plus checks.
- Don't change anything else on these pages.
