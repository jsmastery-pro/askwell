# UI-T08 — Dashboard home with analytics across all projects

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | UI track |
| Needs first | UI-T06 |
| Files allowed | `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/loading.tsx`, `apps/web/app/dashboard/page.test.tsx`, `apps/web/components/dashboard-home/**`, `apps/web/components/dashboard-nav/**`, `apps/web/lib/data/analytics.ts`, `apps/web/lib/data/analytics.test.ts`, `apps/web/lib/mock/analytics.ts`, plus `app/dashboard/billing/page.tsx` and `app/dashboard/not-found.tsx` **only** to follow the `routes.ts` rename |
| project.md | §6.3 Projects, §6.12 Usage, §7 Data model (what can be counted later), §9 Security rules |
| See | `docs/ui-track.md` (rules) |

## Goal
`/dashboard` becomes a real home: analytics across all the owner's projects. Projects stays the list where projects are managed. The product owner picked this layout on 2026-10-13:

```
Askwell  Dashboard  Projects  Billing      you@site (o)
Dashboard                          [ 7d | 30d | 90d ]
[ Messages ] [ Conversations ] [ Visitors ] [ Projects 2 of 3 ]
Messages per day, all projects   (chart)
[ Projects: usage this month ]   [ Recent chats ]
```

## Steps
1. **Navbar and routes.** The navbar reads **Dashboard · Projects · Billing**. `/dashboard` stops redirecting and renders the home. In `routes.ts`, add `OVERVIEW_PATH = "/dashboard"` and rename `DASHBOARD_HOME` to `PROJECTS_PATH`, updating its importers. The `APP_NAME` logo links to `/dashboard`. Dashboard is active **only** on exact `/dashboard`; Projects stays active on every `/dashboard/projects/*` page.
2. **Range.** A `7d | 30d | 90d` switch, kept in the URL (`?range=30d`) so the page renders on the server. Anything outside the allowlist falls back to `30d`. The switch is a group of links with `aria-current`, not client state.
3. **Stat cards** (2×2 at 375 px, 4 in a row on desktop), for the chosen range:
   - **Messages**, **Conversations**, **Visitors** (unique visitor IDs): mock, with the change against the previous period of the same length ("+18%"). When the previous period is 0, show "New" instead of a percentage.
   - **Projects**: real, "2 of 3" from the owner's projects and `PLAN_LIMITS`.
4. **Messages per day chart.** All projects, one bar or point per day in the range. Mock data. No chart library: use inline SVG or CSS. If you think a library is worth it, name it and the size in the PR. It needs a text alternative (a visually hidden table or a summary such as "1,284 messages, busiest day Oct 9: 96") and must fit 375 px without horizontal scroll.
5. **Projects: usage this month** (real). Each project's `messages_used` against its limit, with `currentUsage` and `UsageSummary`/`UsageMeter` from Billing. Each name links to its project; a "Manage projects" link goes to Projects. Show at most 5, busiest first.
6. **Recent chats** (mock). The 5 newest conversations across all the owner's projects: preview text, project name, time. Each links to `/dashboard/projects/<id>/conversations/<cid>`, so mock conversations must hang off the owner's **real** project IDs (reuse the `lib/mock/conversations` fixtures). Then the links open the existing thread page.
7. **Empty states.**
   - **No projects:** replace the cards and chart with a welcome and a short getting-started list (create a project → add knowledge → install the widget → first chat), with **Create project** linking to Projects.
   - **Projects but no chats** in the range: the cards show 0, and the chart shows "No chats yet. Install the widget to start." with a link to the busiest project's Install tab.
8. **Data seam.** Add `lib/data/analytics.ts`. Reads take the signed-in `userId` and only ever touch that owner's projects (real parts through `listProjects`/`listProjectUsage`). The mocked functions are marked `// MOCK: owner analytics query over messages/conversations (wiring task TBD by John)`. `loading.tsx` uses `LoadingState`/`Bone`; the existing `app/dashboard/error.tsx` covers errors.
9. **Tests.** The range allowlist and fallback; the percentage change, including "New" when the previous period is 0; Dashboard active only on exact `/dashboard`; both empty states; recent chats only from the owner's projects; and that the mock seam never returns another owner's project.

## Done when
- [ ] `/dashboard` shows the home; the navbar has Dashboard · Projects · Billing with the right active state on every page
- [ ] Switching 7d/30d/90d changes the URL, the cards and the chart; `?range=abc` shows 30d
- [ ] Projects count and usage this month are real; the mock sections carry the Demo badge
- [ ] Both empty states show for a new account and for an account with projects but no chats
- [ ] A recent chat link opens that conversation's thread page
- [ ] Usable at 375 px, no horizontal scroll; keyboard reaches the range switch and every link
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- **Sign-in still lands on `/dashboard`**, which is now the home. Check that sign-up and sign-in end there.
- No new API route, table or `packages/shared` change. Every number can later be counted from tables that already exist (`messages.created_at`, `conversations.visitor_id`, `projects.messages_used`). John adds the wiring task when conversation data is real (after Phase 3).
- Don't add an "unanswered questions" or answer-quality metric. Nothing in the data model stores it.
- Billing is unchanged in this task.
