# P3-T07 — Arcjet rate limit

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | B |
| Needs first | P3-T04 |
| Files allowed | `apps/web/lib/rate-limit/**`, `apps/web/app/api/widget/config/**`, `packages/db/schema/**`, `packages/db/migrations/**`, `apps/web/package.json`, `pnpm-lock.yaml`, `.env.example` |
| project.md | §3 Stack (Rate limiting), §6.6 Chat (Protect), §7 Data model, §9 Security rules (Cost abuse), §11 Environment variables |

## Goal
Arcjet replaces our Postgres rate limiter on the public widget routes. The limits stay the same (`RATE_LIMITS` in `packages/shared`), and the `rate_limits` table goes away.

## Steps
1. Add `@arcjet/next`. Name it and the reason in the PR body. `ARCJET_KEY` is server-only; add it to `.env.example` with a one-line comment.
2. Rewrite `lib/rate-limit` on Arcjet's fixed window rule, driven by `RATE_LIMITS.widgetConfig` and `RATE_LIMITS.widgetChat`. Count per route + public key + client IP.
   - Pass the IP from our `getClientIp` (Cloudflare's `cf-connecting-ip` first) as a custom characteristic. Don't rely on Arcjet's own IP detection behind InstaCloud's edge.
   - Keep the result shape `{ allowed, retryAfterSeconds }`. `retryAfterSeconds` comes from the decision's reset time, at least 1.
   - The signature may change to take the `Request` (Arcjet's `protect` needs it). Keep it one function the chat route can call.
3. Arcjet errors or times out → allow the request and log the error (fail open, as `project.md` §3 says). Never throw out of the limiter.
4. Switch `GET /api/widget/config` to the new limiter. Same `429` `rate_limited` response and `Retry-After` header as today.
5. Drop the `rate_limits` table: remove it from the schema, `pnpm db:generate` for the migration, update the schema test's table list.
6. Tests with `@arcjet/next` mocked (no network in tests): allowed → `200`; denied → `429` with `Retry-After`; Arcjet error → allowed; the characteristic includes the public key and the IP.

## Done when
- [ ] Config route: a denied decision → `429` `rate_limited` with `Retry-After`
- [ ] An Arcjet error lets the request through
- [ ] No `rate_limits` table in the schema; the migration drops it
- [ ] No test calls the real Arcjet API
- [ ] On your InstaCloud environment with `ARCJET_KEY` set, the 61st config request in a minute from one IP → `429`, and the Arcjet dashboard shows the requests
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- **CodeRabbit is required** (API route + migration).
- Only the per-minute rate limit moves to Arcjet. The monthly message quota, the file limits and the message length limit stay in our code: Arcjet doesn't know a project's plan.
- Don't add Arcjet's shield or bot detection here. Only the rate limit was approved.
- Bob's P3-T02 also touches `apps/web/package.json` and `pnpm-lock.yaml`. Whoever merges second rebases and reruns `pnpm install`.
- If your sandbox blocks Arcjet's API, ask the product owner to allow it. Unit tests don't need it.
- The product owner runs the migration on `main`.
