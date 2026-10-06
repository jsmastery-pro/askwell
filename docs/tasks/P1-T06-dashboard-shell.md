# P1-T06 — Dashboard shell + account row

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | B |
| Needs first | P1-T01, P1-T05 |
| Files allowed | `apps/web/app/dashboard/**` |
| project.md | §6.2 Auth |

## Goal
An empty dashboard shell with navigation, and an `accounts` row created for every Clerk user on their first sign-in.

## Steps
1. `apps/web/app/dashboard/layout.tsx`: shell with nav placeholder and a sign-out control.
2. On load, check for an `accounts` row for the current Clerk user ID; if missing, insert one with `plan: 'free'`. Use an upsert (`ON CONFLICT DO NOTHING` on `clerk_user_id`) — no webhook needed.
3. `/dashboard` renders an empty "Welcome" state. Projects, Knowledge, etc. come in later phases.
4. A test for the insert-if-not-exists logic.

## Done when
- [ ] A brand-new Clerk user signing in creates exactly one `accounts` row, plan `free`
- [ ] Signing in again does not create a duplicate row
- [ ] `/dashboard` shows the shell, nav placeholder, and sign-out control
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- If P1-T01 isn't merged when you reach this task, stop and ask rather than mocking the db — this task writes real rows and shouldn't ship against a stub schema.
