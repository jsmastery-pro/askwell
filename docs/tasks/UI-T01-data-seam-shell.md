# UI-T01 — Data seam + mocks + project shell

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | UI track |
| Needs first | P2-T07 |
| Files allowed | `apps/web/lib/data/**`, `apps/web/lib/mock/**`, `apps/web/app/dashboard/projects/[id]/layout.tsx`, `apps/web/app/dashboard/projects/[id]/page.tsx`, `apps/web/app/dashboard/layout.tsx`, `apps/web/app/dashboard/page.tsx`, `apps/web/components/project-shell/**` |
| project.md | §6.3 Projects, §6.4, §6.7, §6.12 (shapes only), §9 Security rules (Tenant leak, XSS) |
| See | `docs/ui-track.md` (rules) |

## Goal
The seam every later UI task uses (data functions + typed mocks), and a project page with tabs that the other screens slot into.

## Steps
1. `apps/web/lib/mock/`: realistic fixtures typed with the `packages/shared` types: knowledge sources (mixed `processing`/`ready`/`failed`, all 3 types), conversation summaries + full threads (visitor/bot), a few with HTML-looking text to prove text rendering. Deterministic (no `Math.random` at render).
2. `apps/web/lib/data/`: one file per domain (`knowledge.ts`, `conversations.ts`, `config.ts`, `billing.ts`, `usage.ts`). Each function is `async`, returns a `packages/shared` type, and is marked `// MOCK: replace with <route/task>` where it isn't real. Real reads (projects, plan, `messages_used`, `period_start`, stored widget config) query the DB directly, scoped by owner.
3. `/dashboard/projects/[id]/layout.tsx`: loads the project through `getOwnedProject` (else `notFound()`), shows its name and tabs: **Overview, Knowledge, Conversations, Customize, Install**. The active tab is highlighted, and the tabs scroll horizontally on mobile.
4. `/dashboard/projects/[id]` (Overview): messages this month vs. plan limit (real), knowledge files vs. limit (mock count), last 3 conversations (mock), links into each tab.
5. Dashboard nav (`dashboard/layout.tsx`): add **Billing**. Keep Overview + Projects.
6. `/dashboard` Overview: replace "Creating a project is coming in the next update" with the real project list summary + a "Create project" link (the #28 follow-up, moved here from P3-T03).
7. The Projects list rows link to the project page (not straight to Install).
8. Tests: each mock data function returns data matching its shared zod schema; another owner's project ID → 404; the project layout renders the tabs.

## Done when
- [ ] `/dashboard/projects/<id>` shows the tabs and the Overview with real usage numbers
- [ ] Another owner's project ID → 404
- [ ] Every mock fixture parses with its `packages/shared` schema (test)
- [ ] `grep -rn "MOCK:" apps/web/lib/data` lists every mocked function
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- The existing Install page (`projects/[id]/install`) just inherits the new layout. Don't move or rewrite it.
- Tab pages that don't exist yet (Knowledge, Conversations, Customize) can 404 until UI-T02 to UI-T04 add them.
