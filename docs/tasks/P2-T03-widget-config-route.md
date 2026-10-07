# P2-T03 — Widget config route + rate limit

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P2-T01 |
| Files allowed | `apps/web/app/api/widget/config/**`, `apps/web/lib/rate-limit/**`, `apps/web/lib/widget-config/**` |
| project.md | §8 API routes (Public), §6.5 Widget, §5 Plans, §9 Security rules (Public key abuse, Cost abuse, CORS) |

## Goal
A public, rate-limited `GET /api/widget/config?key=pk_...` that returns the plan-applied widget config to any origin.

## Steps
1. `apps/web/lib/widget-config`: `getWidgetConfigByKey(key)` → resolves the project by `public_key` only, loads its config and the owner's plan, returns `applyPlanToConfig(...)` or `null`.
2. `apps/web/lib/rate-limit`: `checkRateLimit(key, limit)` on the `rate_limits` table (key = public key + IP). One atomic upsert per call; reset the window in place when it expires.
3. Route: validate `key` with zod; rate limit; unknown key → `404`; over limit → `429`; success → `200` with the config.
4. CORS: `Access-Control-Allow-Origin: *` on every response, including errors. Handle `OPTIONS`. No credentials.
5. Tests: unknown key → `404`; Free project returns defaults with badge even if its stored config differs; Pro returns stored values; limit + 1 calls → `429`; CORS header present.

## Done when
- [ ] `curl -H "Origin: https://example.com" ".../api/widget/config?key=<real key>"` returns the config with `Access-Control-Allow-Origin: *`
- [ ] Unknown key → `404`, no project data leaked
- [ ] Free project always gets defaults + badge
- [ ] Hammering past the limit returns `429`
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- The public key identifies a project. It grants nothing else — never return owner ID, project name, or usage.
- `getWidgetConfigByKey` is also used by `/embed` (P2-T06). Keep its signature stable once merged.
- `checkRateLimit` will be reused by the chat route in Phase 3. Keep it generic.
- Get the client IP from the platform's forwarded header; fall back to a fixed string rather than skipping the limit.
