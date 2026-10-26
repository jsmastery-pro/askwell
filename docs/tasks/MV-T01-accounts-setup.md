# MV-T01 — Supabase and Vercel setup (product owner)

| Field | Value |
|---|---|
| Owner | Product owner (John wrote the checklist) |
| Track | Platform move |
| Needs first | — (step 4 needs MV-T03 merged) |

## Why
Product owner decision, 2026-10-26: Askwell leaves InstaCloud. The database and file storage move to Supabase, and hosting moves to Vercel. One Supabase project is for dev (shared by Bob, Alice and every Vercel preview), and one is for production. We start fresh: nothing is copied from InstaCloud.

Agents never create accounts or handle raw keys, so these steps are yours.

## Checklist
1. **Supabase.** Create two projects, `askwell-dev` and `askwell-prod`, in the same region, close to your Vercel region. In **each** project:
   - **Project Settings → Data API → turn it off.** We never use it. With it on, anyone holding the project URL and its public publishable key could read and change every table through Supabase's REST API (found 2026-10-26). MV-T03 also turns on row-level security as a backstop.
   - Storage → create a **private** bucket (dev uses `askwell`; any name works, since `BUCKET_NAME` holds it).
   - Storage → Settings → S3 access keys → create a key pair. Note the S3 endpoint and the region.
   - Database settings → SSL → download the root certificate. Its PEM text becomes `DATABASE_CA_CERT` (public, not a secret).
   - Connect → copy two connection strings:
     - the **transaction pooler** (port 6543), which becomes `DATABASE_URL`
     - the **direct / session** connection (port 5432), which becomes `DIRECT_URL`, for migrations only
2. **Vercel.** Import the GitHub repo with these settings (from #86):
   - Root Directory: `apps/web`. If Vercel doesn't turn on "Include files outside the Root Directory" by itself, turn it on.
   - Build Command (override): `cd ../.. && pnpm exec turbo run build --filter=@askwell/web`
   - Install Command, Output Directory, framework: leave the defaults (Next.js, `pnpm install`, `.next`).
   - Node.js: 22.x.
   - Then set env vars per environment:
   - **Production** → `askwell-prod` values. **Preview and Development** → `askwell-dev` values.
   - Database: `DATABASE_URL`, `DIRECT_URL`, `DATABASE_CA_CERT`.
   - Storage: `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BUCKET_NAME` (the bucket name, e.g. `askwell`). These names stay as they were; only the values come from Supabase's S3 settings.
   - Don't add `NEXT_PUBLIC_SUPABASE_URL` or the publishable key: the app doesn't use the Supabase JS client.
   - In every environment: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `OPENAI_API_KEY`, `ARCJET_KEY` (never `ARCJET_ENV=development`), `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.
   - **Production only:** `NEXT_PUBLIC_APP_URL` (the production URL) and `LANDING_WIDGET_KEY` (set after step 6). Leave both unset on previews.
   - **Turn off automatic production promotion**, so you can run a merged PR's migration on prod before its build goes live. Merging still builds production; you promote it by hand. This is in project.md §4, from CodeRabbit on #84.
3. **Clerk.** Point the billing webhook at `https://<production URL>/api/clerk/webhook`, with the same subscription events as before.
4. **Migrations.** After MV-T03 merges, run them once on each project: `DIRECT_URL=<project's direct URL> pnpm db:migrate`. After that, for every PR with a migration: merge it, run the migration on dev and then prod, and only then promote the production build.
5. **Developers.** Put the `askwell-dev` values into Bob's and Alice's `.env.local`. Update their `ROLE.md`: their "deploy" is now the Vercel preview URL on each PR, not an InstaCloud branch.
6. **Askwell project.** On production, once the app is up: create the "Askwell" project on a **Pro** account, upload `docs/askwell-knowledge.md`, set `LANDING_WIDGET_KEY` to its public key, and redeploy.
7. **Shut down InstaCloud** once the P6-T05 launch check passes on Vercel.

## Done when
- [ ] Both Supabase projects exist, each with a private `knowledge` bucket and S3 keys
- [ ] The Vercel project is connected, with Production on prod values and Preview on dev values
- [ ] Migrations have run on both projects
- [ ] Bob and Alice have the dev values, and their `ROLE.md` is updated

## Notes
- Free tier: Supabase free projects pause after about a week with no activity. Vercel Hobby's terms don't allow commercial use, which is fine while billing is in test mode, but a real launch likely needs Vercel Pro. Both risks were flagged on 2026-10-26.
