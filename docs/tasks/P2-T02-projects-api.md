# P2-T02 — Projects API

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P1-T02, P1-T06, P2-T01 |
| Files allowed | `apps/web/app/api/projects/**`, `apps/web/lib/projects/**` |
| project.md | §6.3 Projects, §5 Plans, §8 API routes (Owner), §9 Security rules |

## Goal
Owners can list, create, rename, and delete their projects, with the Free/Pro project limit checked on the server.

## Steps
1. `GET /api/projects`: the signed-in owner's projects only.
2. `POST /api/projects`: read the owner's plan from `accounts` on the server; count their projects; refuse over `PLAN_LIMITS[plan].projects` with `403` and `{ error: { code: "plan_limit", ... } }`.
3. On create, in one transaction: insert the project with `public_key` = `pk_` + random (crypto, URL-safe, ≥ 24 bytes), and insert its `widget_configs` row with defaults.
4. `PATCH /api/projects/:id` (rename) and `DELETE /api/projects/:id`: load the project through `getOwnedProject(id, ownerId)` first. `null` → `404`.
5. Validate every body with the zod schemas from `packages/shared`.
6. Tests for each route: unauthenticated → `401`; other owner's project → `404`; Free second project → `403`; create makes a `widget_configs` row.

## Done when
- [ ] Owner A cannot see, rename, or delete owner B's project (`404`)
- [ ] A Free owner's second `POST` returns `403` with code `plan_limit`
- [ ] A new project has a unique `pk_...` key and a `widget_configs` row
- [ ] Deleting a project removes its config (cascade)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Plan comes from the database, never the request body.
- Owner routes are same-origin only. No CORS headers here.
- Delete is hard delete; cascades already exist from P1-T01.
