# SB-T01 — Setup for the Supabase-native data layer (product owner)

| Field | Value |
|---|---|
| Owner | Product owner (John wrote the checklist) |
| Track | Supabase-native |
| Needs first | — |

## Why
Product owner decision, 2026-10-27: Askwell is built for a JSM video, and Supabase is a sponsor, so it uses Supabase the native way: `supabase-js`, RLS, `rpc()`, Storage signed uploads, the Supabase CLI and MCP. Clerk stays for sign-in and billing, connected to Supabase through Supabase's official third-party auth.

Agents never create accounts or handle raw keys, so these steps are yours. Do them in the **dev** project now; prod comes before launch.

## Checklist
1. **Connect Clerk to Supabase.**
   - Clerk dashboard → Integrations → **Supabase** → activate it, and copy the Clerk domain it shows.
   - Supabase → **Authentication → Third-party Auth → Add provider → Clerk**, and paste that domain.
   - This makes Clerk session tokens valid for Supabase, so RLS can read the user ID (`auth.jwt()->>'sub'`).
2. **Turn the Data API back on** (Project Settings → Data API). `supabase-js` needs it. From now on, the RLS policies in SB-T02 are the guard. Keep the `public` schema exposed and nothing else.
3. **API keys** (Project Settings → API Keys):
   - the **publishable** key, becoming `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public by design)
   - a **secret** key, becoming `SUPABASE_SECRET_KEY` (server only; never `NEXT_PUBLIC_`)
   - the project URL, becoming `NEXT_PUBLIC_SUPABASE_URL`
4. **Env.** Put those three into Bob's and Alice's `.env.local`, and into Vercel **Preview + Development**. Keep the old `DATABASE_URL`/`AWS_*` values until SB-T08 removes them; the current app still uses them.
5. **Supabase MCP for the agents, dev only.**
   - Create a Supabase personal access token (Account → Access Tokens).
   - Configure the MCP server for Bob and Alice **scoped to the dev project** (`project_ref`). Never prod.
   - It lets agents run SQL and apply migrations over HTTPS, which works from their sandboxes.
6. **Supabase agent skills.** If Supabase gives sponsors official agent skills or docs for AI, send John the link, and he'll have them installed for the team.
7. **Storage bucket.** No action: SB-T06's migration creates the private bucket.

## Done when
- [ ] Clerk ↔ Supabase third-party auth connected in dev
- [ ] Data API on in dev
- [ ] The three new env values reach Bob, Alice and Vercel Preview
- [ ] The Supabase MCP works for Bob and Alice against dev only
