# UI-T06 — Polish pass + core-flow click-through

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | UI track |
| Needs first | UI-T02, UI-T03, UI-T04, UI-T05 |
| Files allowed | `apps/web/app/dashboard/**`, `apps/web/components/**` (except `landing/` and `widget-panel/`) |
| project.md | §2 Core flow, §6.1–§6.12 (UI only) |
| See | `docs/ui-track.md` (rules) |

## Goal
Every screen is consistent and complete, and the §2 core flow can be clicked through end to end, with mocks where needed.

## Steps
1. Add `loading.tsx` and `error.tsx` for the dashboard and project routes. Make sure every list has an empty state.
2. One consistent set of shared pieces (page header, card, badge, button variants, confirm dialog) in `apps/web/components/ui/`. Replace near-duplicates.
3. Check at 375 px and 1280 px. Keyboard: every action reachable, visible focus, dialogs trap focus and close on Escape.
4. Click through the §2 core flow on the `alice` deploy: sign up → create project → Knowledge (mock upload) → Install (copy) → Conversations (mock) → Customize (Free paywall) → Billing. Put a short clip in the PR.
5. `grep -rn "MOCK:" apps/web` and paste the list in the PR. That's Bob's wiring checklist.
6. **#45 follow-up:** the navbar's `AccountMenu` closes on `blur` when `relatedTarget` is outside it. In Safari and Firefox on macOS a clicked button doesn't take focus, so after opening the menu from the keyboard, a mouse click on **Sign out** likely blurs with `relatedTarget = null` and hides the panel before the click lands. Fix it (e.g. `tabIndex={-1}` on the panel) and check in Safari.

## Done when
- [ ] The core flow clicks through with no dead ends or broken links
- [ ] Every screen has loading, empty and error states
- [ ] Usable at 375 px; keyboard-only works
- [ ] Account menu: open with the keyboard, then click Sign out with the mouse in Safari. It signs out.
- [ ] The PR lists every `MOCK:` function
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass
