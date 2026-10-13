# UI-T07 — Top navbar + merge Overview into Projects

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | UI track |
| Needs first | UI-T04 |
| Files allowed | `apps/web/app/dashboard/layout.tsx`, `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/projects/page.tsx`, `apps/web/components/projects/**`, `apps/web/components/project-shell/**`, `apps/web/components/dashboard-nav/**` |
| project.md | §6.2 Auth (sign-out), §6.3 Projects, §6.12 Usage |
| See | `docs/ui-track.md` (rules) |

## Goal
Product owner decision (2026-10-13): replace the dashboard sidebar with a **top navbar**, and merge the dashboard Overview into **Projects**. There are only two top-level destinations. Everything else lives in the project tabs.

## Steps
1. **Navbar** in `dashboard/layout.tsx`, full width at the top: `APP_NAME` (links home) · **Projects** · **Billing** on the left; the account area (signed-in email or avatar via Clerk, plus **Sign out**) on the right. It sticks to the top on scroll, the content below uses the full width, and the max width matches the project pages.
2. **Active state:** Projects is active on `/dashboard/projects` and every `/dashboard/projects/*` page; Billing on `/dashboard/billing`. Keep `aria-current="page"`.
3. **Mobile (375 px):** the navbar stays one row; Projects and Billing still fit, or collapse into a menu button with a keyboard-accessible menu. No horizontal page scroll.
4. **Merge Overview into Projects.** `/dashboard/projects` becomes the one home page: the project list with each project's monthly usage (moved from today's `/dashboard`), create, rename, delete, the empty state, and the upgrade hint at the project limit.
5. `/dashboard` **redirects to** `/dashboard/projects`, so sign-in's `/dashboard` fallback still works.
6. Remove the sidebar code and the Overview nav item. Keep `NavLink` (restyle it for a light or dark top bar), or move it to `components/dashboard-nav/`.
7. Tests: the navbar renders Projects and Billing with the right active state, including on a nested project page; `/dashboard` redirects; the Projects page shows usage for each project.

## Done when
- [ ] No sidebar: one top navbar on every dashboard page, and project tabs sit under it
- [ ] `/dashboard` → `/dashboard/projects`; Projects shows the list with usage
- [ ] The active state is correct on `/dashboard/projects/<id>/...` pages
- [ ] Usable at 375 px wide; keyboard-only works (including any mobile menu)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Do this right after UI-T04 (#43) and **before UI-T05**, so Billing is built against the final layout. Re-check the Customize page under the new navbar.
- The project page's tabs (UI-T01) don't change.
