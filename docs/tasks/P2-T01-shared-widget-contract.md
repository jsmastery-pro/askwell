# P2-T01 — Shared widget contract additions

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P1-T03 |
| Files allowed | `packages/shared/**` |
| project.md | §5 Plans, §6.5 Widget, §9 Security rules (postMessage, Plan bypass) |

## Goal
Add the widget pieces both lanes import in Phase 2 that P1-T03 didn't already provide: a pure helper that applies the plan to a config, the postMessage event types, and rate limit constants. Approved contract change — additive only.

## Steps
1. Defaults already exist: reuse `DEFAULT_WIDGET_CONFIG` and `WidgetConfig` from P1-T03 (`src/widget.ts`). Don't add a second defaults constant or config type.
2. `applyPlanToConfig(stored, plan)`: pure function. `free` → returns `DEFAULT_WIDGET_CONFIG` (badge on), ignoring stored values. `pro` → stored values, with `null` text fields falling back to `DEFAULT_WIDGET_CONFIG`. Returns `WidgetConfig`.
3. postMessage types: a discriminated union for panel → loader (`close`, `resize`, `unread`) and loader → panel if needed. Include a type guard that validates an unknown `event.data`.
4. `RATE_LIMITS`: per key+IP window for public routes. Start with `{ windowSeconds: 60, max: 60 }` for config; leave room for chat in Phase 3.
5. Export everything from the existing entry point.
6. Tests: `applyPlanToConfig` for free (stored values ignored, badge on) and pro (nulls fall back, badge honoured); the type guard rejects junk.

## Done when
- [ ] `applyPlanToConfig` tests pass for both plans
- [ ] postMessage type guard rejects objects without a known `type`
- [ ] Nothing defined in P1-T03 is renamed or changed
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Do this first. P2-T02, P2-T03, P2-T05, P2-T06 all import it. Keep the PR small so it merges fast.
- This task owns `packages/shared` for Phase 2. If a later Phase 2 task needs another shared change, stop and ask.
- Rate limit numbers are a starting point — call them out in the PR body.
