# P5-T03 — Customize save: PATCH /api/projects/:id/config (402 for Free)

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | B |
| Needs first | P1-T02, P5-T01 |
| Files allowed | `apps/web/app/api/projects/[id]/config/**`, `apps/web/lib/widget-config/**`, `apps/web/lib/data/config-actions.ts` |
| project.md | §6.8 Customize, §5 Plans, §9 Security rules (Plan bypass) |

## Background
UI-T04 already built the Customize screen with a live preview, Free paywall UI, and a mocked save (`apps/web/lib/data/config-actions.ts`'s `saveWidgetConfig` — `MOCK: replace with PATCH /api/projects/:id/config, which returns 402 on Free`). Reads are already real (`apps/web/lib/data/config.ts`'s `getStoredWidgetConfig`/`getWidgetConfig`, used by both the Customize page and the public `/api/widget/config` route via `applyPlanToConfig`). This task only adds the save route and wires it — don't touch the Customize page or its components.

## Steps
1. `PATCH /api/projects/:id/config`: load the project through `getOwnedProject`. Not owned → `404`. Read the owner's plan on the server — Free → `402` (don't write anything). Validate the body with `updateWidgetConfigRequestSchema` (`packages/shared`).
2. Upsert into `widget_configs` (one row per project, already created with defaults on project creation — see `lib/projects`). A `null` field value resets that field to `WIDGET_DEFAULTS` for the column, same semantics the mock already documents.
3. `apps/web/lib/widget-config/`: add the write helper (read helpers may already be here for the public config route — check before duplicating logic).
4. `lib/data/config-actions.ts`: replace `saveWidgetConfig`'s `MOCK:` body with a real call to the new route.
5. Tests: another owner's project → `404`; Free → `402`, config unchanged; Pro → `200`, config updated and persisted; a `null` field resets to default; an invalid value (e.g. bad hex color, bad enum) → `400`.

## Done when
- [ ] Pro save → `200`, the stored config changes, and the public `/api/widget/config` route reflects it on the next fetch
- [ ] Free save → `402`, nothing written
- [ ] Owner A can't update owner B's config (`404`)
- [ ] `grep -rn "MOCK:" apps/web/lib/data/config-actions.ts` returns nothing
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- The plan is read on the server, never trusted from the client (project.md §9) — the UI's Free lock is cosmetic only, this route is the real gate.
- No schema change — `widget_configs` already exists (P1-T01) with one row per project.
- Don't touch `apps/web/app/dashboard/projects/[id]/customize/**` or `apps/web/components/customize/**` — UI-T04's, already built.
