# P6-T04 — Responsive and empty-state polish

| Field | Value |
|---|---|
| Owner | Alice if her session is back, otherwise Bob |
| Lane | B |
| Needs first | P6-T03 |
| Files allowed | UI only: `apps/web/app/**/page.tsx`, `apps/web/app/**/loading.tsx`, `apps/web/app/**/error.tsx`, `apps/web/components/**`. No API routes, `lib/**`, or `packages/**`. |
| project.md | §2, §6.1, §6.3–§6.12 |

## Goal
Every screen works at 375 px and on desktop, with real empty, loading and error states, now that it shows real data.

## Steps
1. Click through every screen on your deploy at 375 px and at desktop width, signed out and signed in, in this order:
   - landing, sign in/up
   - dashboard home, Projects, project overview
   - Knowledge, Conversations (list + thread)
   - Customize, Install, Billing
   - the widget panel
2. For each screen, check that:
   - it has no horizontal scroll
   - the empty state makes sense with real data (a new account, a project with no knowledge or chats)
   - a loading state exists
   - an error state exists
3. Fix UI-only issues. List anything that needs non-UI changes in the PR body for John.

## Done when
- [ ] The PR body has a checklist of every screen × 375 px / desktop, with what was fixed
- [ ] No screen scrolls horizontally at 375 px
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- UI-only: CodeRabbit isn't required.
