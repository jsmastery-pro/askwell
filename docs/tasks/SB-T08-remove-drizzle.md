# SB-T08 — Remove Drizzle, pg and the old env (pglite stays for tests)

| Field | Value |
|---|---|
| Owner | Bob |
| Track | Supabase-native |
| Needs first | SB-T04, SB-T05, SB-T06, SB-T07 |
| Files allowed | `packages/db/**`, `apps/web/lib/widget-config/test-db.ts`, `package.json`, `apps/web/package.json`, `packages/db/package.json`, `pnpm-lock.yaml`, `.env.example`, any remaining test that still imports Drizzle |
| project.md | §3, §11 |

## Steps
1. Delete:
   - the Drizzle schema, migrations and config
   - the `pg` client
   - the old `queries/`
   - the Drizzle-based pglite test helpers (keep `supabase-pglite.ts` and pglite as a test dev-dependency)
   - the `db:generate`/`db:migrate` scripts
   - the S3 SDK
2. `packages/db` becomes the generated `types.ts` plus anything shared by both clients.
3. `.env.example` lists only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and the non-Supabase vars. `DATABASE_URL`, `DIRECT_URL`, `DATABASE_CA_CERT` and `AWS_*` go.
4. `grep -rniE "drizzle|@aws-sdk|DATABASE_URL|DIRECT_URL" apps packages` finds nothing.

## Done when
- [ ] The grep is clean
- [ ] Checks pass
- [ ] The preview still works end to end

## Notes
- CodeRabbit is required.
