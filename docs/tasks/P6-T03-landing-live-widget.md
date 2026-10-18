# P6-T03 — Landing page runs Askwell's own widget

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | B |
| Needs first | P3-T06 |
| Files allowed | `apps/web/app/page.tsx`, `apps/web/components/landing/**`, `.env.example`, `docs/askwell-knowledge.md` (new) |
| project.md | §2 Core flow (steps 1–2), §6.1 Landing page, §11 |

## Goal
The landing page shows the real chat widget, which answers questions about Askwell itself (§6.1). Today it shows `LiveDemoPlaceholder`.

## Steps
1. **Widget on the landing page:**
   - The landing page loads `/widget.js` with an Askwell project's public key.
   - The key comes from a new server env var, `LANDING_WIDGET_KEY`, read at request time. InstaCloud has no build-time env, the same reason `components/projects/snippet.ts` and `/api/posthog-config` read env at runtime.
   - The landing page is prerendered today, so pick a way that works: make it dynamic, or have a small client component fetch the key. Say which in the PR.
   - No key set → no widget, and the page still renders.
2. **Live demo section:** replace `LiveDemoPlaceholder` with a section that points visitors to the widget in the corner, e.g. "Try it: ask the chat in the corner about Askwell". Match the landing page's look; don't redesign it.
3. **Install snippet:** `InstallSnippet` hardcodes `https://askwell.app/widget.js`. Use the app's real URL the same way the Install page does (`resolveAppUrl`).
4. **`docs/askwell-knowledge.md`:** plain text the product owner uploads to an "Askwell" project on `main`. Cover:
   - what Askwell is and how it works (the 3 steps)
   - Free vs Pro, using the numbers from `PLAN_LIMITS` in `packages/shared`
   - the install snippet
   - supported file types
   - what's out of scope (project.md §12)
5. Tests:
   - The widget script renders with the key.
   - Nothing renders without it.
   - The snippet uses the resolved URL.

## Done when
- [ ] On your `bob` deploy, with `LANDING_WIDGET_KEY` set to one of your projects:
  - The landing page shows the widget.
  - It answers from that project's knowledge.
- [ ] Without the key, the landing page renders with no widget and no errors
- [ ] `docs/askwell-knowledge.md` exists, and its plan numbers match `PLAN_LIMITS`
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- John adds `LANDING_WIDGET_KEY` to project.md §11.
- The key is public (it only identifies a project), but it's still per-environment config, not a constant in code.
- The Askwell project on `main` should belong to a Pro account. The landing widget uses the project's monthly message quota, and Free's 100 would run out fast.
