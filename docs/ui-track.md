# UI track

Product owner decision, 2026-10-12: build **every remaining screen first**, with real data where it already exists and typed mock data everywhere else. Make it functional afterwards.

- **Alice** builds all UI-track tasks, in order. **Bob is paused** until the UI track is done.
- `plan.md` and `project.md` are unchanged. The phases still define what "functional" means. This track only changes *when* the screens get built.
- **The UI track owns the screens.** Later phase tasks that include a screen (e.g. P3-T03's Knowledge page, the Phase 4 Conversations list, Phase 5 Customize/Billing pages) only **wire data** into the screens built here. John trims those task files when their phase starts.
- No analytics screen: §6.11 is PostHog on our side, not an owner-facing page.

## Rules for every UI task

| Rule | Detail |
|---|---|
| Real vs mock | **Real**: anything readable today: projects, the owner's plan, `messages_used`, `period_start`, a project's stored widget config. **Mock**: knowledge sources, conversations and messages, and every *write* that has no API yet (add/delete source, save config, upgrade, manage billing). |
| One seam | Screens never import mock fixtures directly. They call functions in `apps/web/lib/data/**` (e.g. `listKnowledgeSources(projectId)`), typed with the existing `packages/shared` response types. The mock implementations read from `apps/web/lib/mock/**`. Later, Bob replaces the function bodies; screens don't change. |
| Mark mocks | Every mocked function and mocked action has a `// MOCK:` comment saying what will replace it (route or task ID). `grep -rn "MOCK:" apps/web` must list all of them. |
| Mock actions | Mocked writes update local state only, so the UI behaves as if they worked, and show a small "Demo data" badge where the data is fake. Nothing is written to the database. |
| No backend | No new API routes, tables, columns, or `packages/shared` changes. The types already exist (P1-T03). If a screen needs a type that isn't there, stop and ask. |
| Security still applies | Every project page loads the project through `getOwnedProject`. All user/visitor text renders as text, never HTML. Plan gating reads the plan on the server. |
| Reuse | Reuse `apps/web/components/**` and the dashboard's look (fonts, colors, `FOCUS`). Responsive down to 375 px. Empty, loading and error states on every screen. |

## Tasks

| ID | Task | Owner | Needs | Status | PR |
|---|---|---|---|---|---|
| UI-T01 | Data seam + mocks + project shell | Alice | P2-T07 | todo | — |
| UI-T02 | Knowledge screen | Alice | UI-T01 | todo | — |
| UI-T03 | Conversations screens | Alice | UI-T01 | todo | — |
| UI-T04 | Customize screen + live preview | Alice | UI-T01 | todo | — |
| UI-T05 | Billing + usage screens | Alice | UI-T01 | todo | — |
| UI-T06 | Polish pass + core-flow click-through | Alice | UI-T02…T05 | todo | — |

UI-T02 to UI-T05 all depend only on UI-T01. Alice does them one at a time, one PR each.

## When the UI track is done

Bob resumes. In order: P3-T01 (#32, ready), then Phase 3 Lane A, wiring the Knowledge screen to the real ingest/delete routes. Then the later phases, each replacing the matching `MOCK:` functions.
