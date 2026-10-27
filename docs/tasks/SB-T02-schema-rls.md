# SB-T02 — Supabase schema and RLS policies

| Field | Value |
|---|---|
| Owner | Bob |
| Track | Supabase-native |
| Needs first | — (local work). Applying to dev needs SB-T01 and SB-T10's answer. |
| Files allowed | `supabase/**` (new: `config.toml`, `migrations/`, `seed.sql`), `package.json` (`supabase` scripts only), a new pglite test helper and tests under `packages/db/**` |
| project.md | §7 Data model, §9 Security rules |

## Goal
The same 7 tables as today, defined as a Supabase CLI migration, with RLS that enforces tenant isolation **in the database**.

## Steps
1. `supabase init` at the repo root. One baseline migration that recreates today's schema (`packages/db/schema/index.ts`, migrations 0000–0003): tables, enums, `vector` extension, HNSW index, FKs and cascades. Keep column names, so the app's shapes don't change.
2. **RLS on every table**, with policies for the `authenticated` role, using the Clerk user ID from the token (`(auth.jwt()->>'sub')`):
   - `accounts`: a user reads their own row only.
   - `projects`: a user reads, updates and deletes their own projects. **No direct insert**: creation goes through SB-T03's function, because of the project limit.
   - `widget_configs`, `knowledge_sources`, `knowledge_chunks`, `conversations`, `messages`: a user reads them when they own the parent project (use a `security definer` helper like `owns_project(project_id)`, with a fixed `search_path`).
   - Writes that need a plan or limit check (config save, knowledge add, quota) **don't** get direct policies. They go through server routes and SB-T03's functions.
   - `anon` gets **nothing** on any table. Revoke `TRUNCATE` from `anon` and `authenticated`, as in today's 0003.
3. Types move to SB-T03: they're generated from the dev project once this migration is applied there.
4. Tests on **pglite**, with a helper that stubs what the migration relies on: the `anon`, `authenticated` and `service_role` roles, the `auth` and `extensions` schemas, `auth.jwt()` as Supabase defines it, and Supabase's default privileges. SB-T03 reuses the helper. Tests:
   - owner A can't read owner B's projects, chunks or messages
   - `anon` reads nothing
   - an owner can't insert a project directly
   - deleting a project cascades
5. Don't touch the app's code yet. SB-T04/T05 switch it over.

## Done when
- [ ] pglite applies the migration with Supabase's roles and privileges stubbed
- [ ] The policy tests pass on pglite
- [ ] The PR lists every policy in a table: table, operation, rule
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- CodeRabbit is required (database, security). This is a contract change, approved by the product owner on 2026-10-27.
- **Decided 2026-10-27:** no local Supabase stack in any sandbox (the image pull broke the disks). The real checks run on the dev project through the MCP after merge.
- After the reset, dev has no Drizzle migration history. Never run `pnpm db:migrate` against dev again; migrations go through `supabase db push` (or the MCP) from then on.
- Dev data is throwaway. Applying this to the dev project means resetting it: only after merge, through the MCP or by the product owner.
