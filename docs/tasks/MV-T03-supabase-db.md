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
3. **TLS, decided 2026-10-26 (product owner):** verify the server.
   - Read Supabase's root certificate (PEM text) from `DATABASE_CA_CERT` and connect with full verification.
   - If `DATABASE_CA_CERT` is unset (local dev without it), still require TLS, and log once that the server isn't verified.
   - Never fall back to plain text.
   - Add `DATABASE_CA_CERT` to `.env.example`. The certificate is public, not a secret.
4. **Migrations:** apply all existing migrations to the dev project from `main`. That includes 0000's pgvector extension and the HNSW index. Report anything Supabase needs changed. Don't edit merged migrations; add a new one if needed.
5. **Lock Supabase's Data API (security, 2026-10-26):** Supabase exposes every `public` table through its REST API to anyone with the project's public key. Add a **new** migration that runs `ENABLE ROW LEVEL SECURITY` on every table, with no policies, so those API roles see nothing. Our app connects as the tables' owner, which RLS doesn't apply to (don't use `FORCE`). Prove it two ways:
   - The app still works against dev Supabase.
   - A `GET` to the project's REST API returns no rows. The product owner also turns the Data API off (MV-T01).
6. **Docs:** `.env.example` lists `DATABASE_URL` and `DIRECT_URL` with one-line comments. The seed script's InstaCloud instructions become Supabase ones.

## Done when
- [ ] Migrations apply cleanly to the dev Supabase project
- [ ] The app works locally against dev Supabase: sign in, create a project, chat
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Live check moved (2026-10-26)
Agent sandboxes can only make HTTP requests through a proxy, and Postgres needs a raw TCP connection, so no sandbox can reach Supabase's database. #87 merges on review + CodeRabbit. Then:
1. The product owner runs `DIRECT_URL=<session pooler URL> pnpm db:migrate` on `main` from their machine (0000–0003).
2. The app check (sign in → create project → chat) happens on the first Vercel preview.
3. Checking that the REST API returns nothing happens after the migration.

## Notes
- CodeRabbit is required (database).
- **Shared dev database (new rule):** never apply an unmerged migration to the dev project. Test new migrations on pglite or local Postgres; they reach dev only after the PR merges.
