# P1-T06 — Dashboard shell + account row

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | B |
| Needs first | P1-T01, P1-T05 |
| Files allowed | `apps/web/app/dashboard/**`, `apps/web/app/(auth)/**`, `apps/web/components/landing/Pricing.tsx`, `apps/web/components/landing/LiveDemoPlaceholder.tsx`, `apps/web/package.json`, `apps/web/next.config.ts`, `pnpm-lock.yaml` |
| project.md | §6.2 Auth, §5 Plans |

## Goal
An empty dashboard shell with navigation, and an `accounts` row created for every Clerk user on their first sign-in.

## Steps
1. `apps/web/app/dashboard/layout.tsx`: shell with nav placeholder and a sign-out control.
2. On load, check for an `accounts` row for the current Clerk user ID; if missing, insert one with `plan: 'free'`. Use an upsert (`ON CONFLICT DO NOTHING` on `clerk_user_id`) — no webhook needed.
3. `/dashboard` renders an empty "Welcome" state. Projects, Knowledge, etc. come in later phases.
4. A test for the insert-if-not-exists logic.
5. Carried over from P1-T05: set `fallbackRedirectUrl="/dashboard"` on `<SignIn />` and `<SignUp />`, so a direct visit to `/sign-in` lands on `/dashboard` after signing in (today it goes to `/`).
6. Carried over from P1-T05 (landing follow-up): replace the hardcoded plan numbers in `Pricing.tsx` and `LiveDemoPlaceholder.tsx` with `PLAN_LIMITS` from `@askwell/shared`. Remove the TODO.

## Done when
- [ ] A brand-new Clerk user signing in creates exactly one `accounts` row, plan `free`
- [ ] Signing in again does not create a duplicate row
- [ ] `/dashboard` shows the shell, nav placeholder, and sign-out control
- [ ] Signing in from a direct visit to `/sign-in` (no `redirect_url`) lands on `/dashboard`
- [ ] Landing pricing reads every limit from `PLAN_LIMITS`; `grep -rn '2,000\|"100"' apps/web/components/landing` finds no hardcoded limits
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- The web app gets `@askwell/db` from P2-T03 (Bob). If that isn't merged when you start, add `@askwell/db` (`workspace:*`) to `apps/web/package.json` and `transpilePackages` yourself — same change, whoever merges second keeps one entry.
- Dependency edits in `apps/web/package.json` / `pnpm-lock.yaml` may overlap with another open PR. If yours merges second: `git merge origin/main`, keep both sides' entries, run `pnpm install`, re-run checks. No force-push.
- If P1-T01 isn't merged when you reach this task, stop and ask rather than mocking the db — this task writes real rows and shouldn't ship against a stub schema.
