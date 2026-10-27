# P6-T05 — Launch check: the core flow on Vercel production

| Field | Value |
|---|---|
| Owner | Product owner (John writes the checklist) |
| Lane | B |
| Needs first | P6-T02, P6-T03, P6-T04, P6-T06, the Platform move track (MV-T01…T05) and the Supabase-native track (SB-T01…T11) |
| project.md | §2 Core flow |

## Goal
All nine steps of the core flow pass on the Vercel production URL. This is the Phase 6 done-when, and it also proves Phases 3–5's done-when on `main`.

## Setup (product owner)
Done in **MV-T01** (`docs/tasks/MV-T01-accounts-setup.md`): Supabase dev and prod projects, the Vercel project and env vars, migrations, the Clerk webhook, and the "Askwell" project with `LANDING_WIDGET_KEY`.

### Production cutover to Supabase-native (product owner, before promoting)
The first `main` build after #95 needs the prod Supabase project set up like dev (SB-T01). Do these in the **prod** project, in order:
1. **Clerk ↔ Supabase:** in the production Clerk instance, activate the Supabase integration; in Supabase prod, Authentication → Third-party Auth → add Clerk with that domain.
2. **Data API on**, exposing only the `public` schema.
3. **Migrations:** apply every file in `supabase/migrations`, oldest first (Supabase CLI: `supabase link --project-ref <prod ref>`, then `supabase db push`). Prod's old Drizzle tables don't match the new schema: reset prod first. Its data is throwaway until launch.
4. **Vercel Production env:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (Sensitive) from the prod project.
5. **Check:** Supabase → Advisors → Security shows no errors (the `rls_auto_enable` notice is covered in `docs/security-review.md`); the `knowledge` bucket exists and is private.
6. **Landing project:** sign up on production, create the "Askwell" project, add its knowledge, set `LANDING_WIDGET_KEY` to its public key.
7. **Promote** the build, run the nine steps below, then delete `DATABASE_URL`, `DIRECT_URL`, `DATABASE_CA_CERT`, `AWS_*` and `BUCKET_NAME` from every Vercel environment.

In PostHog, also:
- Turn on session replay.
- Set the funnel to: landing pageview → `signed_up` → `project_created` → `knowledge_added` → `snippet_copied` → `first_chat` → `upgraded`.

## The nine steps (project.md §2)
Run from a normal browser. For step 4, serve the HTML page over `http`, e.g. `python3 -m http.server`; don't open it from disk.

| # | Step | Pass when |
|---|---|---|
| 1 | Open the landing page | The widget is in the corner |
| 2 | Ask it a product question | It answers from the Askwell knowledge |
| 3 | Sign up, create a project, upload a product PDF (up to 10 MB) | The PDF reaches `ready` |
| 4 | Copy the script tag from Install into a plain HTML page | The widget appears |
| 5 | Ask a question on that page | The answer comes from the PDF; an unrelated question gets "I don't know" |
| 6 | Open Conversations | The chat is there |
| 7 | Open Customize | The paywall shows; saving is refused |
| 8 | Upgrade to Pro with a Clerk Billing test card | Customize unlocks. If it doesn't, check the logs for "Couldn't confirm the Pro subscription with Clerk": the webhook's Clerk check (P6-T02, L5) wasn't testable before `main`. |
| 9 | Change the button color, reload the HTML page | The new color shows |

Afterwards, in PostHog:
- the funnel shows each step
- the chats show as AI traces with cost
- session replay excludes Conversations pages

## Done when
- [ ] All nine steps pass on Vercel production
- [ ] PostHog shows the events and AI traces
- [ ] John marks Phases 3–6 done in `plan.md`
