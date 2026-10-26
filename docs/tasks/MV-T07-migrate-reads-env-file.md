# MV-T07 — `pnpm db:migrate` reads `DIRECT_URL` from `.env.local`

| Field | Value |
|---|---|
| Owner | Bob |
| Track | Platform move |
| Needs first | MV-T03 (#87) |
| Files allowed | `packages/db/drizzle.config.ts`, `packages/db/package.json` (the `db:migrate` script), co-located tests |
| project.md | §11 Environment variables |

## Why
Today `pnpm db:migrate` only sees a `DIRECT_URL` typed inline (`DIRECT_URL="…" pnpm db:migrate`). Neither `drizzle.config.ts` nor the script loads an env file. Product owner decision, 2026-10-26: migrations stay manual, but the command reads `.env.local`, so `pnpm db:migrate` just works.

## Steps
1. Load the **repo root's** `.env.local`, then `.env`, when running drizzle-kit (`process.loadEnvFile`, or dotenv). `pnpm --filter` runs from `packages/db`, so resolve the root path explicitly. A missing file isn't an error.
2. **A value already in the environment wins over the file.** `DIRECT_URL=<prod> pnpm db:migrate` must use the inline prod URL even when `.env.local` holds the dev one. Test this.
3. Keep the existing guard, which fails with a clear message when no `DIRECT_URL` is found anywhere. Make sure it runs **after** the file is loaded.
4. Before migrating, print which **host** is being migrated (never the password), e.g. `Migrating aws-0-…pooler.supabase.com:5432`, so a wrong target is obvious.

## Done when
- [ ] With `DIRECT_URL` only in `.env.local`, `pnpm db:migrate` finds it
- [ ] An inline `DIRECT_URL` overrides `.env.local` (test)
- [ ] No `DIRECT_URL` anywhere → the same clear error as today
- [ ] The target host is printed, and the password never is
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- CodeRabbit is required (database tooling).
- Migrations still never run automatically. Vercel builds don't migrate.
