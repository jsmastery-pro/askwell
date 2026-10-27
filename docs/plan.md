# Plan

The build order for Askwell. `docs/project.md` describes each feature in detail.

## Rules

- Build phases in this order. Don't add, remove, or reorder phases.
- Each phase has two parallel lanes. One developer takes each lane, so nobody waits.
- John and the product owner break down a phase into tasks before it starts. The next phase can be broken down while the current one is being built.
- John lists each task under its phase and keeps its status current. Nobody else edits status.
- A phase is done when all its tasks are merged and its "Done when" checks pass on `main`.
- The product owner adds a phase's keys to every environment before the phase starts. Agents never create accounts or handle raw keys in chat. If a task needs a key that isn't listed, the agent stops and asks.

**Status values:** `todo` · `in progress` · `in review` · `done` · `blocked`

> **UI track (2026-10-12, product owner):** Alice builds every remaining screen first, with mock data where there's no backend yet. Bob is paused until then. See [`docs/ui-track.md`](ui-track.md). The phases below are unchanged. Their screen work is built in the UI track, and their tasks then wire the data.

> **Review rule (2026-10-13, product owner):** CodeRabbit is required only where a miss is costly. **Required:** PRs touching API routes, auth, the database/migrations, `packages/shared`, the widget bundle, billing, or chat/RAG. If it's rate limited, wait for the free slot; never use paid on-demand reviews. **Not required:** UI-track (mock data) PRs merge on John's review plus all checks; if CodeRabbit does review, its threads still get fixed or answered. Docs-only PRs merge on sight.

---

## Phase 0 — Setup

**Goal:** an empty app that builds and deploys. This is the only phase with one lane, because everything else builds on it.

**Keys before start:** InstaCloud account + project (no app keys yet)

| Includes                                                                  | project.md |
| ------------------------------------------------------------------------- | ---------- |
| Monorepo with `apps/web`, `apps/widget`, `packages/shared`, `packages/db` | §10        |
| Next.js app with TypeScript and Tailwind                                  | §3         |
| Dockerfile (Next.js standalone) + first deploy to InstaCloud `main`       | §3, §4     |
| `.env.example` with every variable                                        | §11        |

**Done when:** the app's home page loads from the InstaCloud `main` URL.

**Tasks:**

| ID | Task | Owner | Needs | Status | PR |
|---|---|---|---|---|---|
| P0-T01 | Monorepo + tooling | Bob | — | done | #2 |
| P0-T02 | Next.js app | Bob | P0-T01 | done | #6 |
| P0-T03 | Docker + env + first deploy | Bob | P0-T02 | done | #10 |

---

## Phase 1 — Foundation

**Goal:** the shared contract, the database, sign-in, and the public face of the app.

**Keys before start:** `DATABASE_URL` (InstaCloud Postgres), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`

| Lane                        | Includes                                                                                                                                                | project.md |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **A — Contract + database** | Drizzle schema for all tables, pgvector, first migration, db client, `getOwnedProject` helper. Shared types for every API route. Plan limits.           | §5, §7, §8 |
| **B — Auth + shells**       | Clerk sign in / sign up, middleware, `accounts` row on first sign-in, empty dashboard layout with navigation, landing page (static, no live widget yet) | §6.1, §6.2 |

**Done when:** migrations run on `main`; a new user signs up and lands on an empty dashboard; the landing page is live.

**Tasks:**

| ID | Task | Owner | Needs | Status | PR |
|---|---|---|---|---|---|
| P1-T01 | DB schema + migration | Bob | — | done | #3, #4 |
| P1-T02 | getOwnedProject helper | Bob | P1-T01 | done | #10 |
| P1-T03 | Shared API contract + plan limits | Bob | — | done | #6 |
| P1-T04 | Landing page (static) | Alice | — | done | #7, #11 |
| P1-T05 | Clerk auth pages + middleware | Alice | — | done | #16 |
| P1-T06 | Dashboard shell + account row | Alice | P1-T01, P1-T05 | done | #20 |

---

## Phase 2 — Projects + widget

**Goal:** an owner can create a project and see the widget on any website. Replies are fake for now.

**Keys before start:** `NEXT_PUBLIC_APP_URL` (no new services)

| Lane             | Includes                                                                                                    | project.md     |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | -------------- |
| **A — Projects** | Projects CRUD + Free/Pro limit, `public_key`, default widget config, Install page, `GET /api/widget/config` | §6.3, §6.9, §8 |
| **B — Widget**   | Loader script (button, iframe, `postMessage`), `/embed` panel UI with mock replies, visitor ID              | §6.5           |

**Done when:** create a project → copy the snippet → a plain HTML page on another origin shows the button → the panel opens and shows a mock reply.

**Tasks:**

| ID | Task | Owner | Needs | Status | PR |
|---|---|---|---|---|---|
| P2-T01 | Shared widget contract additions | Bob | P1-T03 | done | #13 |
| P2-T02 | Projects API | Bob | P1-T02, P1-T06, P2-T01 | done | #23 |
| P2-T03 | Widget config route + rate limit | Bob | P2-T01 | done | #18 |
| P2-T04 | Projects dashboard + Install page | Bob | P2-T02 | done | #28 |
| P2-T05 | Widget loader script | Alice | P2-T01 | done | #24, #27 |
| P2-T06 | Embed panel with mock replies | Alice | P2-T01 | done | #29 |
| P2-T07 | Serve widget.js, frame headers, cross-origin test | Alice | P2-T05, P2-T06 | done | #34 |

---

## Phase 3 — Knowledge + chat

**Goal:** the bot answers real questions from the owner's documents.

**Keys before start:** `OPENAI_API_KEY`, `STORAGE_*` (InstaCloud storage), `ARCJET_KEY`

> **Rate limiting (2026-10-17, product owner):** Arcjet replaces the Postgres rate limiter on the public widget routes (P3-T07). The monthly quota stays in our database.

| Lane              | Includes                                                                                                                              | project.md |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **A — Knowledge** | Paste text + upload PDF/MD/TXT, storage, text extraction, chunking, embeddings, Knowledge page with source status, delete, file limit | §6.4       |
| **B — Chat**      | Arcjet rate limit, `POST /api/widget/chat`: rate limit, quota, retrieval, answer, save, count. Connect the `/embed` panel to it.     | §6.6       |

Lane B tests retrieval with seeded chunks until Lane A is merged.

**Done when:** upload a PDF → ask about it on the plain HTML page → correct answer; an unrelated question → "I don't know"; the 21st message in a minute is refused.

**Tasks:**

| ID | Task | Owner | Needs | Status | PR |
|---|---|---|---|---|---|
| P3-T01 | AI + shared foundations | Bob | P2-T03 | done | #32 |
| P3-T02 | Knowledge ingest | Bob | P3-T01, P2-T02 | done | #61 |
| P3-T03 | Delete source + wire Knowledge screen | Bob | P3-T02, P2-T04 | done | #63 |
| P3-T04 | Chunk search + seed script | Alice | P3-T01 | done | #62 |
| P3-T07 | Arcjet rate limit | Bob | P3-T04 | done | #70 |
| P3-T05 | Chat route | Bob | P3-T04, P3-T07, P2-T03 | done | #72 |
| P3-T06 | Connect the panel to chat | Bob | P3-T05, P2-T06 | done | #74 |
| P3-T08 | Read InstaCloud's storage env vars | Bob | P3-T02 | done | #75 |

> **Lane B reassigned (2026-10-17, product owner):** Alice's session failed before P3-T07 started (no branch or PR). P3-T07, P3-T05 and P3-T06 move to Bob, in that order. P3-T07 branches after #69 merges, since both add dependencies.

PostHog AI trace (§6.6 step 6) deferred to Phase 4 — product owner, 2026-10-08.

---

## Phase 4 — Conversations + analytics

**Goal:** the owner sees what visitors ask, and we see how the product is used.

**Keys before start:** `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (the PostHog wizard creates them)

| Lane                          | Includes                                                                                             | project.md  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ----------- |
| **A — Conversations + usage** | Conversations list + thread, usage display per project                                               | §6.7, §6.12 |
| **B — Analytics**             | PostHog wizard, product events, funnel, session replay, error tracking, AI tracing in the chat route | §6.11       |

**Done when:** a widget chat appears in Conversations after refresh; the usage count goes up; PostHog shows the events and an AI trace with its cost.

**Tasks:**

| ID | Task | Owner | Needs | Status | PR |
|---|---|---|---|---|---|
| P4-T01 | Conversations API + wiring | Bob | P1-T02, P2-T02 | done | #64 |
| P4-T02 | Owner analytics wiring (dashboard home) | Bob | P4-T01 | done | #65 |
| P4-T03 | PostHog setup: wizard, events, funnel, replay, errors | Bob | — | done | #69 |
| P4-T04 | `first_chat` event + AI trace | Bob | P4-T03, P3-T05, P3-T06 | done | #77 |

Lane B is normally Alice's; product owner approved giving P4-T03 to Bob (2026-10-17) since it's independent of her Phase 3 work, while #68 is in review. Scope cut: `first_chat` event + AI tracing wait for Phase 3 Lane B to merge (a follow-up task, P4-T04).

---

## Phase 5 — Billing + customize

**Goal:** Free vs Pro works end to end.

**Keys before start:** `CLERK_WEBHOOK_SIGNING_SECRET`. In the Clerk dashboard: Billing on with the Clerk payment gateway (test mode), plans `free` and `pro`, and a webhook to `/api/clerk/webhook` with the subscription events.

> **Billing provider (2026-10-17, product owner):** Clerk Billing replaces Stripe Checkout and the portal. We use the Clerk payment gateway, so there is no Stripe account and no Stripe keys.

| Lane              | Includes                                                                                                                       | project.md |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| **A — Billing**   | Clerk webhook → `accounts.plan`, billing page with Clerk's pricing table, drop `stripe_customer_id` and the checkout/portal types | §6.10      |
| **B — Customize** | Customize page with live preview, `PATCH /api/projects/:id/config` with 402 for Free, plan-applied config in the widget, badge | §6.8       |

Lane B builds the 402 path first, then tests Pro by setting `accounts.plan` by hand until Lane A is merged.

**Done when:** Free save → 402 → upgrade with a test card → save works → the widget shows the new color on reload.

**Tasks:**

| ID | Task | Owner | Needs | Status | PR |
|---|---|---|---|---|---|
| P5-T01 | Clerk Billing: webhook, pricing table, drop Stripe | Bob | P1-T02 | done | #66 |
| P5-T02 | Fix Clerk webhook plan-write bugs | Bob | P5-T01 | done | #67 |
| P5-T03 | Customize save: PATCH /api/projects/:id/config | Bob | P1-T02, P5-T01 | done | #68 |

Lane B is normally Alice's, but she's still on Phase 3 Lane B (Arcjet/chat route/panel) — product owner approved giving P5-T03 to Bob since it doesn't overlap her work, 2026-10-17.

**P5-T02 note:** #66 merged before 2 unresolved CodeRabbit findings on the webhook route were fixed: (1) plan writes aren't gated by `event.data.plan?.slug`, so a non-Pro plan's events could still flip `accounts.plan`; (2) the account is downgraded to `free` on `subscriptionItem.canceled`, but Clerk's own docs say paid access should continue until `subscriptionItem.ended` — canceling shouldn't cut off access immediately. Both are live on `main`. Also: `apps/web/lib/data/billing-actions.ts` is still a dead empty-module stub (asked for deletion, didn't land) — fold that cleanup in too.

Lane B (Customize) added once a developer is free for it.

---

## Phase 6 — Harden + launch

**Goal:** the core flow works on `main`, with no open security issues.

> **Carried into Lane A (2026-10-17, from #70 review):** a missing `ARCJET_KEY` makes the limiter allow every request, with only one log line. Before launch, confirm `ARCJET_KEY` is set on `main` and decide whether production should refuse to start without it. The monthly quota still caps cost per project. Also: Arcjet logs a WARN about resolving `ip.src` from an unverified forwarding header; our limit uses `getClientIp` instead, so it's noise, but `proxies` for InstaCloud's Cloudflare edge would silence it.

> **Carried into Lane A (2026-10-18, from #77):** CodeRabbit was rate-limited and never reviewed #77 (`first_chat` + `$ai_generation` in `lib/chat`). John reviewed it in full. Include the chat route in the §9 pass.

**Keys before start:** none new

| Lane             | Includes                                                                                                    | project.md |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | ---------- |
| **A — Security** | Fix open review findings, security headers (`frame-ancestors`), CORS check, final pass on every rule in §9  | §9         |
| **B — Launch**   | Landing page runs the app's own widget, responsive and empty-state polish, run the full core flow on `main` | §2, §6.1   |

**Done when:** all nine steps of the core flow (§2) pass on the `main` URL.

**Tasks:** (product owner approved 2026-10-18)

| ID | Task | Owner | Needs | Status | PR |
|---|---|---|---|---|---|
| P6-T01 | Security audit (report only) | John | Phases 0–5 | done | `docs/security-review.md` |
| P6-T02 | Security fixes from the report | Bob | P6-T01, P6-T03 | done | #80 |
| P6-T03 | Landing page runs Askwell's own widget | Bob | P3-T06 | done | #79 |
| P6-T04 | Responsive + empty-state polish | Bob | P6-T03 | done | #81 |
| P6-T06 | Fix the landing "Install in one line" section | Bob | P6-T03, P6-T04 | done | #83 |
| P6-T07 | Landing nav knows you're signed in | Bob | — | done | #90 |
| P6-T05 | Launch check: core flow on Vercel production | Product owner | P6-T02, P6-T03, P6-T04, P6-T06, MV-T01…T05, SB-T01…T11 | todo | — |

> **Missing `ARCJET_KEY` (2026-10-18, product owner):** in production, the chat route returns 503 when the key is unset. Arcjet outages still fail open. Built in P6-T02.

> **Pasted text limit (2026-10-18, product owner):** pasted text counts toward the same per-project limit as files: Free 3, Pro 25 knowledge sources in total (audit finding M2). Built in P6-T02.

---

## Platform move — Supabase + Vercel

> **Decision (2026-10-26, product owner):** Askwell leaves InstaCloud. Database and file storage move to **Supabase**: one project for dev (shared by Bob, Alice and every Vercel preview), one for production. Hosting moves to **Vercel**: previews per PR, production from `main`. We start fresh (nothing is copied from InstaCloud), and the upload limit drops from 10 MB to **4 MB** (Vercel's 4.5 MB request body limit). The P6-T05 launch check runs on Vercel production once this track is done.

**Shared dev database:** never apply an unmerged migration to the dev project. Migrations never run on Vercel deploys: previews would apply unmerged migrations to the shared dev database, and production is promoted by hand after its migration (product owner, 2026-10-26). Migrations reach dev, then prod, only after their PR merges.

| ID | Task | Owner | Needs | Status | PR |
|---|---|---|---|---|---|
| MV-T01 | Supabase + Vercel accounts and setup | Product owner | — | in progress | Dev done 2026-10-26: Vercel live at askwell-eosin.vercel.app, migrations run, Data API off, Clerk webhook verified (upgrade unlocks Customize). Left: prod Supabase + Production env, `LANDING_WIDGET_KEY`, PostHog receipt |
| MV-T05 | Client IP from Vercel's trusted headers (security) | Bob | — | done | #85 (verified live 2026-10-26: forged IP headers, 21st → 429) |
| MV-T02 | Build and run on Vercel; remove InstaCloud | Alice | — | done | #86 (verified live 2026-10-26: build, headers, chat; PostHog receipt to be confirmed by the product owner) |
| MV-T03 | Database on Supabase (pooled + direct URLs) | Bob | MV-T01 | done | #87 (verified live 2026-10-26: chat flow + RLS holds on all 7 tables) |
| MV-T04 | Storage on Supabase; 4 MB uploads | Alice | MV-T01 | done | #88 (verified live 2026-10-26: upload → ready, delete, 4.2 MB → 413) |
| MV-T06 | `vercel.json` for Vercel's import (one service, `web`) | Alice | MV-T02 | done | #89 |
| MV-T07 | `pnpm db:migrate` reads `DIRECT_URL` from `.env.local` | Bob | MV-T03 | done | #91 |

---

## Supabase-native data layer

> **Decision (2026-10-27, product owner):** Askwell is built for a JSM video, and Supabase is a sponsor, so it uses Supabase the native way, not as plain Postgres + S3:
> - `supabase-js` everywhere
> - RLS policies enforce tenant isolation for owner data, with Clerk connected through Supabase's third-party auth, so Clerk keeps sign-in and billing
> - Postgres functions through `rpc()` for atomic operations, callable only by our server
> - Storage with direct signed uploads, so uploads go back to **10 MB**
> - Supabase CLI migrations and generated types
> - the Supabase MCP for agents, dev only
>
> **Decided 2026-10-27 (product owner):** no local Supabase stack (`supabase start`, Docker) in any sandbox or on the product owner's Mac: the image pull filled the disk and broke every sandbox. Policies and functions are tested on **pglite with Supabase's roles, `auth.jwt()` and default privileges stubbed** (`packages/db/supabase-pglite.ts`, from SB-T02). The real check is on the dev project, through the MCP, after merge.
>
> Drizzle, `pg` and the S3 SDK are removed at the end; pglite stays as the test database. The current app stays live until the new layer replaces it. The P6-T05 launch check runs on this version.

| ID | Task | Owner | Needs | Status | PR |
|---|---|---|---|---|---|
| SB-T01 | Clerk ↔ Supabase, Data API on, keys, MCP (dev only), agent skills | Product owner | — | todo | — |
| SB-T10 | Spike: local Supabase + MCP inside the sandboxes | Alice | — | done | — (local stack runs, but we don't use it: the image pull fills the product owner's disk. The MCP check moves to SB-T01.) |
| SB-T02 | Supabase schema and RLS policies | Bob | — | done | #92 |
| SB-T03 | Postgres functions: project and knowledge limits (`rpc()`) | Bob | SB-T02 | todo | — |
| SB-T11 | Postgres functions: chat quota, chat save, chunk search (`rpc()`) | Alice | SB-T02 | todo | — |
| SB-T04 | Generated types; owner side on `supabase-js` + RLS | Bob | SB-T03, SB-T11 (on dev) | todo | — |
| SB-T05 | Widget, chat, billing webhook on `supabase-js` + `rpc()` | Alice | SB-T04, SB-T11 | todo | — |
| SB-T06 | Storage with direct signed uploads; 10 MB | Alice | SB-T03 | todo | — |
| SB-T07 | Knowledge processing on Supabase | Alice | SB-T05, SB-T06 | todo | — |
| SB-T08 | Remove Drizzle, pg, S3 SDK, old env (pglite stays for tests) | Bob | SB-T04…T07 | todo | — |
| SB-T09 | Spec rewrite + RLS / function-grant security audit | John | alongside; audit after SB-T08 | in progress | — |
