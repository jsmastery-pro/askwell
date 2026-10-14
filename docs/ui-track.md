# UI track

Product owner decision, 2026-10-12: build **every remaining screen first**, with real data where it already exists and typed mock data everywhere else. Make it functional afterwards.

- **Alice** builds all UI-track tasks, in order. **Bob is paused** until the UI track is done.
- `plan.md` and `project.md` are unchanged. The phases still define what "functional" means. This track only changes *when* the screens get built.
- **The UI track owns the screens.** Later phase tasks that include a screen (e.g. P3-T03's Knowledge page, the Phase 4 Conversations list, Phase 5 Customize/Billing pages) only **wire data** into the screens built here. John trims those task files when their phase starts.
- §6.11 Analytics is PostHog on our side. **Owner-facing analytics** (all projects, on the dashboard home) was added by the product owner on 2026-10-13 as UI-T08. Its numbers come from existing tables, so `project.md` is unchanged.

## Rules for every UI task

| Rule | Detail |
|---|---|
| Real vs mock | **Real**: anything readable today: projects, the owner's plan, `messages_used`, `period_start`, a project's stored widget config. **Mock**: knowledge sources, conversations and messages, and every *write* that has no API yet (add/delete source, save config, upgrade, manage billing). |
| One seam | Screens never import mock fixtures directly. They call functions in `apps/web/lib/data/**` (e.g. `listKnowledgeSources(projectId)`), typed with the existing `packages/shared` response types. The mock implementations read from `apps/web/lib/mock/**`. Later, Bob replaces the function bodies; screens don't change. |
| Mark mocks | Every mocked function and mocked action has a `// MOCK:` comment saying what will replace it (route or task ID). `grep -rn "MOCK:" apps/web` must list all of them. |
| Mock actions | Mocked writes update local state only, so the UI behaves as if they worked, and show a small "Demo data" badge where the data is fake. Nothing is written to the database. |
| No backend | No new API routes, tables, columns, or `packages/shared` changes. The types already exist (P1-T03). If a screen needs a type that isn't there, stop and ask. |
| Security still applies | **Every page** checks ownership itself (`getOwnedProject` or an owner-scoped read → `notFound()`) **before** calling any `lib/data` function. Never rely on the project layout's check alone: in Next.js, layouts and pages render in parallel. Any `lib/data` read that takes an ID from the URL rejects a malformed ID (`isUuid` in `lib/data/ids.ts`) and returns `null`, so `/projects/abc` is a 404, not a 500. All user/visitor text renders as text, never HTML. Plan gating reads the plan on the server. |
| Reuse | Reuse `apps/web/components/**` and the dashboard's look (fonts, colors, `FOCUS`). Responsive down to 375 px. Empty, loading and error states on every screen. |

## Tasks

| ID | Task | Owner | Needs | Status | PR |
|---|---|---|---|---|---|
| UI-T01 | Data seam + mocks + project shell | Alice | P2-T07 | done | #37 |
| UI-T02 | Knowledge screen | Alice | UI-T01 | done | #38 |
| UI-T03 | Conversations screens | Alice | UI-T01 | done | #41 |
| UI-T04 | Customize screen + live preview | Alice | UI-T01 | done | #43 |
| UI-T07 | Top navbar + merge Overview into Projects | Alice | UI-T04 | done | #45 |
| UI-T05 | Billing + usage screens | Alice | UI-T07 | done | #47 |
| UI-T06 | Polish pass + core-flow click-through | Alice | UI-T02…T05 | done | #48 |
| UI-T08 | Dashboard home with analytics across all projects | Alice | UI-T06 | done | #51, #52 |
| UI-T09 | Chat panel states, sign-in redirect, preview focus | Alice | UI-T08 | done | #53 |
| UI-T10 | Design tokens + landing redesign (dark, glass, motion) | Alice | UI-T09 | done | #54 |
| UI-T11 | Dashboard redesign (light monochrome, glass) | Alice | UI-T10 + PO approval | done | #56 |

Alice does them one at a time, one PR each, in table order. UI-T07 was added on 2026-10-13 (product owner: top navbar instead of the sidebar). It comes before UI-T05, so Billing is built on the final layout. UI-T08 (dashboard home with analytics; it brings back `/dashboard` as a page, partly reversing UI-T07's "merge Overview into Projects") and UI-T09 (the last panel and sign-in pieces) were added the same day, so the UI is complete before Bob resumes. UI-T10 and UI-T11 are a visual redesign (product owner, 2026-10-13): black and white with glass, a dark landing page with simple motion, and a light app. The landing page comes first, and the product owner approves its look before the dashboard follows. The landing look was approved on 2026-10-14; the sign-in/up pages keep Clerk's default look.

## When the UI track is done

**Done on 2026-10-14** (UI-T01…UI-T11 merged). Every screen is built in the final look; the `MOCK:` markers are Bob's wiring checklist (see #48).

Bob resumes. P3-T01 is already merged (#32), so he starts with Phase 3 Lane A, wiring the Knowledge screen to the real ingest/delete routes. Then the later phases, each replacing the matching `MOCK:` functions.
