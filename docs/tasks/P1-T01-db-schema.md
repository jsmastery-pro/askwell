# P1-T01 — Database schema + migration

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | none |
| Files allowed | `packages/db/**` |
| project.md | §7 Data model, §9 Security rules (tenant leak) |

## Goal
Define every table from §7 in Drizzle, enable pgvector, and produce the first migration plus a db client.

## Steps
1. Add `accounts`, `projects`, `widget_configs`, `knowledge_sources`, `knowledge_chunks`, `conversations`, `messages`, `rate_limits` to `packages/db/schema`, exactly as columned in §7.
2. Enable the `vector` extension. `knowledge_chunks.embedding` is `vector(1536)`.
3. Add an HNSW index on `knowledge_chunks.embedding`.
4. Add a unique constraint on `projects.public_key`.
5. `packages/db/client.ts`: export a drizzle instance built from `DATABASE_URL`.
6. Run `pnpm db:generate`, commit the migration file.
7. Add a smoke test that imports the schema and asserts the table set.

## Done when
- [ ] `pnpm db:generate` produces a migration with all 8 tables and the `vector` extension
- [ ] `pnpm db:migrate` applies cleanly against your InstaCloud `DATABASE_URL`
- [ ] `knowledge_chunks.embedding` has an HNSW index
- [ ] `projects.public_key` is unique
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass
- [ ] No table or column outside §7 is added

## Notes
- No row-level security. Tenant isolation is app-level, via `getOwnedProject` (P1-T02).
- `DATABASE_URL` should already be in your InstaCloud environment before you start. If it's missing, stop and ask.
- This task owns `packages/db/schema` for the phase — don't start P1-T02 work until this merges.
