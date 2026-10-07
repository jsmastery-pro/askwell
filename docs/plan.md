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
| P1-T06 | Dashboard shell + account row | Alice | P1-T01, P1-T05 | todo | — |

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
| P2-T02 | Projects API | Bob | P1-T02, P1-T06, P2-T01 | todo | — |
| P2-T03 | Widget config route + rate limit | Bob | P2-T01 | in progress | — |
| P2-T04 | Projects dashboard + Install page | Bob | P2-T02 | todo | — |
| P2-T05 | Widget loader script | Alice | P2-T01 | todo | — |
| P2-T06 | Embed panel with mock replies | Alice | P2-T01 | todo | — |
| P2-T07 | Serve widget.js, frame headers, cross-origin test | Alice | P2-T05, P2-T06 | todo | — |

---

## Phase 3 — Knowledge + chat

**Goal:** the bot answers real questions from the owner's documents.

**Keys before start:** `OPENAI_API_KEY`, `STORAGE_*` (InstaCloud storage)

| Lane              | Includes                                                                                                                              | project.md |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **A — Knowledge** | Paste text + upload PDF/MD/TXT, storage, text extraction, chunking, embeddings, Knowledge page with source status, delete, file limit | §6.4       |
| **B — Chat**      | `POST /api/widget/chat`: rate limit, quota, retrieval, answer, save, count. Connect the `/embed` panel to it.                         | §6.6       |

Lane B tests retrieval with seeded chunks until Lane A is merged.

**Done when:** upload a PDF → ask about it on the plain HTML page → correct answer; an unrelated question → "I don't know"; the 21st message in a minute is refused.

**Tasks:** _added by John_

---

## Phase 4 — Conversations + analytics

**Goal:** the owner sees what visitors ask, and we see how the product is used.

**Keys before start:** `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (the PostHog wizard creates them)

| Lane                          | Includes                                                                                             | project.md  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ----------- |
| **A — Conversations + usage** | Conversations list + thread, usage display per project                                               | §6.7, §6.12 |
| **B — Analytics**             | PostHog wizard, product events, funnel, session replay, error tracking, AI tracing in the chat route | §6.11       |

**Done when:** a widget chat appears in Conversations after refresh; the usage count goes up; PostHog shows the events and an AI trace with its cost.

**Tasks:** _added by John_

---

## Phase 5 — Billing + customize

**Goal:** Free vs Pro works end to end.

**Keys before start:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO` (test mode)

| Lane              | Includes                                                                                                                       | project.md |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| **A — Billing**   | Stripe Checkout, customer portal, webhook → `accounts.plan`, billing page                                                      | §6.10      |
| **B — Customize** | Customize page with live preview, `PATCH /api/projects/:id/config` with 402 for Free, plan-applied config in the widget, badge | §6.8       |

Lane B builds the 402 path first, then tests Pro by setting `accounts.plan` by hand until Lane A is merged.

**Done when:** Free save → 402 → upgrade with a test card → save works → the widget shows the new color on reload.

**Tasks:** _added by John_

---

## Phase 6 — Harden + launch

**Goal:** the core flow works on `main`, with no open security issues.

**Keys before start:** none new

| Lane             | Includes                                                                                                    | project.md |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | ---------- |
| **A — Security** | Fix open review findings, security headers (`frame-ancestors`), CORS check, final pass on every rule in §9  | §9         |
| **B — Launch**   | Landing page runs the app's own widget, responsive and empty-state polish, run the full core flow on `main` | §2, §6.1   |

**Done when:** all nine steps of the core flow (§2) pass on the `main` URL.

**Tasks:** _added by John_
