# UI-T11 — Dashboard redesign (light monochrome, glass)

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | UI track |
| Needs first | UI-T10, **plus the product owner's approval of UI-T10's look** |
| Files allowed | `apps/web/app/dashboard/**`, `apps/web/components/**` (except `landing/` and `widget-panel/`), `apps/web/app/globals.css` (app tokens only) |
| project.md | §6.3–§6.12 (UI only) |
| See | `docs/ui-track.md` (rules) |

## Goal
Bring the whole dashboard onto UI-T10's design tokens in a **light** monochrome style: white and grays, a frosted-glass navbar and light glass cards, black as the emphasis colour. Data stays easy to read.

## Steps
1. **Tokens everywhere.** Replace the hard-coded hex colours in `app/dashboard/**` and `components/**` (except `landing/`, `widget-panel/`) with the tokens from UI-T10. Start with `components/ui/styles.ts` (buttons, inputs, links, `CARD`, `FOCUS`), then the rest. Colours that are **data** stay as they are, e.g. a widget's brand colour in Customize or test fixtures.
2. **Light monochrome.** Drop the amber accent: active nav, the busiest chart bar, selected range and tab underlines use black/gray. Semantic colours stay, through tokens: warning (80 % usage), danger (delete, limit reached, errors), success.
3. **Glass, sparingly.**
   - The sticky navbar is glass, so content blurs underneath as it scrolls.
   - Stat cards and section cards may use a light glass over a subtle canvas gradient.
   - **Solid surfaces** for anything dense or interactive: forms, tables/lists, chat threads, dialogs, the Customize preview frame.
   - Same `@supports` fallback and contrast rules as UI-T10.
4. **Motion, minimal.** Short transitions on hover, focus, tab and range changes, and dialog open. No scroll animations in the app. Respect `prefers-reduced-motion`.
5. **Focus ring.** Black (or very dark gray) on light, at least 3:1, visible everywhere.
6. **Customize preview.** The page around it gets the new look. The `Panel` inside keeps the owner's brand colour (it's `widget-panel/`, not in this task).

## Done when
- [ ] Every dashboard page (Dashboard, Projects, a project's Overview/Knowledge/Conversations/thread/Customize/Install, Billing, 404, error and loading states) uses the new look; screenshots at 1280 and 375 px are in the PR
- [ ] `grep -rnE "#[0-9a-fA-F]{6}" apps/web/app/dashboard apps/web/components --include=*.tsx --include=*.ts` lists only `landing/`, `widget-panel/`, tests, and documented data colours
- [ ] Warnings, errors and limit states are still clearly coloured
- [ ] Text contrast ≥ 4.5:1 on every surface, glass included; focus visible everywhere; keyboard-only still works
- [ ] No horizontal scroll at 375 px; with "reduce motion", no transitions
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Visual only: no data, route or behaviour changes. Tests change only where they assert classes.
- This touches many files. Keep it to one PR, but commit in steps (tokens in `styles.ts` → shared pieces → pages) so the review can follow.
