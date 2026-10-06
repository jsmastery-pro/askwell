# P1-T03 — Shared API contract + plan limits

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | none |
| Files allowed | `packages/shared/**` |
| project.md | §5 Plans, §8 API routes |

## Goal
One place for the Free/Pro plan limits and the request/response types for every API route, so no app code redefines them later.

## Steps
1. Add a `PLAN_LIMITS` constant for `free` and `pro`, matching §5 exactly (projects, messages/month, knowledge files).
2. Add a zod schema + inferred TS type for the body and response of every route listed in §8 — including ones that don't exist yet (projects CRUD, knowledge upload, widget config, widget chat, conversations, config patch, billing).
3. Add the shared API error type: `{ error: { code: string, message: string } }`.
4. Export everything from one entry point.
5. A test asserting the `PLAN_LIMITS` shape for both plans.

## Done when
- [ ] `PLAN_LIMITS` matches §5 for `free` and `pro`
- [ ] A zod schema + type exists for every route body/response in §8
- [ ] The shared API error type is exported
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass
- [ ] No route handler logic — types and schemas only

## Notes
- If a route's exact shape isn't obvious from §8, pick the obvious one and call it out in the PR body rather than blocking on it.
- Later phases import these types as-is. Changing one after another lane depends on it is a contract change — stop and ask.
