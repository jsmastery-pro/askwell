# P6-T05 — Launch check: the core flow on `main`

| Field | Value |
|---|---|
| Owner | Product owner (John writes the checklist) |
| Lane | B |
| Needs first | P6-T02, P6-T03, P6-T04 merged and deployed to `main` |
| project.md | §2 Core flow |

## Goal
All nine steps of the core flow pass on the `main` URL. This is the Phase 6 done-when, and it also proves Phases 3–5's done-when on `main`.

## Setup on `main` (product owner)
1. Keys:
   - `OPENAI_API_KEY`, `ARCJET_KEY` (no `ARCJET_ENV=development`)
   - `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
   - `CLERK_WEBHOOK_SIGNING_SECRET`
2. Bind the 5 storage variables to the web app, once for each of `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `BUCKET_NAME`:
   `insta secrets bind <NAME> storage/storage --source-name <NAME> --to compute/web --branch main`
3. Run all pending migrations on `main` (including 0002, which drops `rate_limits`).
4. Deploy `main`.
5. In PostHog:
   - Turn on session replay.
   - Set the funnel to: landing pageview → `signed_up` → `project_created` → `knowledge_added` → `snippet_copied` → `first_chat` → `upgraded`.
6. Create an "Askwell" project on a **Pro** account, upload `docs/askwell-knowledge.md`, and set `LANDING_WIDGET_KEY` to its public key. Redeploy.

## The nine steps (project.md §2)
Run from a normal browser. For step 4, serve the HTML page over `http`, e.g. `python3 -m http.server`; don't open it from disk.

| # | Step | Pass when |
|---|---|---|
| 1 | Open the landing page | The widget is in the corner |
| 2 | Ask it a product question | It answers from the Askwell knowledge |
| 3 | Sign up, create a project, upload a product PDF | The PDF reaches `ready` |
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
- [ ] All nine steps pass on `main`
- [ ] PostHog shows the events and AI traces
- [ ] John marks Phases 3–6 done in `plan.md`
