# UI-T05 — Billing + usage screens

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | UI track |
| Needs first | UI-T07 |
| Files allowed | `apps/web/app/dashboard/billing/**`, `apps/web/components/billing/**`, `apps/web/lib/data/billing.ts`, `apps/web/lib/data/usage.ts`, `apps/web/app/dashboard/projects/[id]/page.tsx` |
| project.md | §6.10 Billing, §6.12 Usage, §5 Plans |
| See | `docs/ui-track.md` (rules) |

## Goal
The account's Billing page and a clear usage display. The plan and message counts are real; Stripe actions are mocked.

## Steps
1. `/dashboard/billing`: the current plan (real), a Free vs. Pro comparison from `PLAN_LIMITS` (the same numbers as the landing page), **Upgrade** (Free) or **Manage subscription** (Pro). Both are mocked: they show what will happen ("Opens Stripe Checkout") instead of navigating.
2. Usage across all projects: each project's messages used / limit with a progress bar (real `messages_used`), the reset date (from `period_start` + 1 month), and a warning at ≥ 80 % and at 100 %.
3. Improve the project Overview's usage block from UI-T01 to use the same usage component.
4. Tests: Free shows Upgrade, Pro shows Manage; the bar caps at 100 %; the warning appears at 80 %.

## Done when
- [ ] Billing shows the real plan and the right action for Free and Pro (mocked)
- [ ] Usage shows real counts, the reset date and the warnings
- [ ] Usable at 375 px wide
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Later wiring: Phase 5 Lane A replaces the `MOCK:` Upgrade/Manage with `POST /api/billing/checkout` and `/portal`.
