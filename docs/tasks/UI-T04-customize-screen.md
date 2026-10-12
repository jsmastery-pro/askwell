# UI-T04 — Customize screen + live preview

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | UI track |
| Needs first | UI-T01 |
| Files allowed | `apps/web/app/dashboard/projects/[id]/customize/**`, `apps/web/components/customize/**`, `apps/web/lib/data/config.ts`, `apps/web/components/widget-panel/**` (read-only reuse; small export-only changes allowed) |
| project.md | §6.8 Customize, §5 Plans, §9 Security rules (Plan bypass) |
| See | `docs/ui-track.md` (rules) |

## Goal
The Customize tab with all six fields, a live preview, and the Free paywall. The current config is read for real; saving is mocked.

## Steps
1. Load the project's stored config (real) and the owner's plan (real, server side).
2. Fields: button color (picker + hex input), position (4 corners), label, animation (fade/slide/scale), header text, "Powered by" badge on/off. Validate with `updateWidgetConfigRequestSchema`. A "Reset to default" per text field.
3. **Live preview** in the page: the launcher button in the chosen corner and the open panel, reusing the real `Panel` component so the preview matches the widget exactly. It updates as you type.
4. **Free:** the form is visible but disabled, with an upgrade prompt linking to Billing (§6.8).
5. **Pro:** Save is enabled. The mocked save shows "Saved" and keeps the values on the page.
6. Tests: Free renders disabled inputs and the upgrade prompt; an invalid color shows an error; the preview updates when a field changes.

## Done when
- [ ] Free: locked form + upgrade prompt; Pro: editable form with a working mock save
- [ ] The preview matches the real panel and updates live
- [ ] Usable at 375 px wide (preview below the form)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- The plan comes from the server, not the client. The UI lock is cosmetic; the real 402 comes in Phase 5.
- Later wiring: Phase 5 Lane B replaces the `MOCK:` save with `PATCH /api/projects/:id/config`.
