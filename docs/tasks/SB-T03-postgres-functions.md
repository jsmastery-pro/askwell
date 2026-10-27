# SB-T03 — Postgres functions: project and knowledge limits (`rpc()`)

| Field | Value |
|---|---|
| Owner | Bob |
| Track | Supabase-native |
| Needs first | SB-T02 (#92) |
| Files allowed | `supabase/migrations/**` (one new migration), `packages/db/supabase-functions-owner.test.ts` (new), `packages/db/supabase-pglite.ts` (additions only) |
| project.md | §5 Plans, §6.3, §6.4, §9 |

## Goal
The two owner-side operations that today rely on a row lock in TypeScript become Postgres functions, called with `supabase.rpc()`. SB-T11 (Alice) does the chat functions in parallel.

## Functions
| Function | Replaces | Rules |
|---|---|---|
| `create_project(owner_id, name, public_key, project_limit)` | `lib/projects` count + insert under lock | Locks the owner's `accounts` row, counts their projects, inserts the project and its default widget config, and refuses when at the limit |
| `reserve_knowledge_source(project_id, title, type, storage_key, source_limit)` | knowledge route's locked count + insert | Locks the project row; files and pasted text count together (M2); inserts the source as `processing` |

## Rules for every function (same in SB-T11)
- **Limits come in as parameters** from our server, which reads the plan from `PLAN_LIMITS` in `packages/shared`. One source of truth.
- So **`EXECUTE` is granted only to `service_role`**, and revoked from `PUBLIC`, `anon` and `authenticated`. Owners can't call these with their own token and pass a bigger limit. Remember Supabase's default privileges grant EXECUTE on new `public` functions to all API roles: revoke explicitly.
- `SECURITY INVOKER` unless there's a reason; if `SECURITY DEFINER`, always `SET search_path = ''`. Name every object with its schema.
- Refusals are a result the server can map to our error codes (e.g. return a status, or raise with a known `SQLSTATE`), not a generic error. Say which in the PR.

## Done when
- [ ] Tests on pglite (SB-T02's helper), under both default-privilege modes: happy path, at-limit refusal, wrong project, and that a refused call inserts nothing
- [ ] A test proves `anon` and `authenticated` can't execute either function, and `service_role` can
- [ ] The PR lists each function: signature, security mode, grants, what it returns or raises
- [ ] Checks pass

## Notes
- CodeRabbit is required.
- No local Supabase stack (decided 2026-10-27). pglite runs one connection, so test the lock logic with sequential calls. The real concurrency check runs on dev after merge.
- Types are generated in SB-T04, once SB-T03 and SB-T11 are applied to dev.
- Branch from `main` after #92 merges. If you start before, branch from `bob/SB-T02-schema-rls` and rebase onto `main` before opening the PR.
