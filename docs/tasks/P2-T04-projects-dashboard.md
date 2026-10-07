# P2-T04 — Projects dashboard + Install page

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P2-T02 |
| Files allowed | `apps/web/app/dashboard/projects/**`, `apps/web/app/dashboard/layout.tsx`, `apps/web/components/projects/**` |
| project.md | §6.3 Projects, §6.9 Install |

## Goal
Owners manage projects from the dashboard and copy a working install snippet.

## Steps
1. `/dashboard/projects`: list, create, rename, delete via the P2-T02 routes. Show the plan-limit error message when create returns `403`.
2. `/dashboard/projects/[id]/install`: the snippet `<script src="${NEXT_PUBLIC_APP_URL}/widget.js" data-key="pk_..."></script>`, a copy button, 3 short steps.
3. Add a "Projects" link to the dashboard nav in `layout.tsx`.
4. Reuse existing components in `apps/web/components`. New ones go in `apps/web/components/projects/`.
5. A test that the snippet builder outputs the right tag for a given key and URL.

## Done when
- [ ] Create, rename, delete work from the UI and survive a reload
- [ ] On Free, creating a second project shows the limit message
- [ ] Install page shows the project's real key; the copy button copies the exact snippet
- [ ] Visiting another owner's project ID shows not found
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Load the project server-side through `getOwnedProject`; don't trust the URL.
- Project names render as text.
- `widget.js` won't be served until P2-T07. The snippet text can be checked before then.
