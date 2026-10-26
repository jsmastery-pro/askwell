# MV-T03 — Database on Supabase

| Field | Value |
|---|---|
| Owner | Bob |
| Track | Platform move |
| Needs first | MV-T01 steps 1 and 5 (dev project and your `.env.local`) for the live check |
| Files allowed | `packages/db/client.ts`, `packages/db/drizzle.config.ts`, `packages/db/package.json`, `package.json` (db scripts only), `.env.example` (database lines), `apps/web/scripts/seed-knowledge.ts` |
| project.md | §3, §7, §11 |

## Steps
1. **Two URLs:** the app uses `DATABASE_URL`, Supabase's transaction pooler (port 6543). `drizzle-kit` (`db:generate` / `db:migrate`) uses `DIRECT_URL`, the direct or session connection.
2. **Serverless pool:** size the `pg` Pool for many short-lived Vercel instances behind the pooler (small `max`, short idle timeout). Confirm nothing uses named prepared statements, which the transaction pooler can't hold.
3. **SSL:** connect with TLS as Supabase requires, without disabling certificate checks unless Supabase's docs say to.
4. **Migrations:** apply all existing migrations to the dev project from `main`. That includes 0000's pgvector extension and the HNSW index. Report anything Supabase needs changed. Don't edit merged migrations; add a new one if needed.
5. **Docs:** `.env.example` lists `DATABASE_URL` and `DIRECT_URL` with one-line comments. The seed script's InstaCloud instructions become Supabase ones.

## Done when
- [ ] Migrations apply cleanly to the dev Supabase project
- [ ] The app works locally against dev Supabase: sign in, create a project, chat
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- CodeRabbit is required (database).
- **Shared dev database (new rule):** never apply an unmerged migration to the dev project. Test new migrations on pglite or local Postgres; they reach dev only after the PR merges.
