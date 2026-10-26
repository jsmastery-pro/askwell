# MV-T05 — Client IP on Vercel (security)

| Field | Value |
|---|---|
| Owner | Bob |
| Track | Platform move |
| Needs first | — |
| Files allowed | `apps/web/lib/rate-limit/**`, `docs/security-review.md` (status of L10 only), `apps/web/app/api/widget/chat/route.test.ts` and `apps/web/app/api/widget/config/route.test.ts` (test-only, added 2026-10-26) |
| project.md | §9 Security rules (Cost abuse) |

## Why
`getClientIp` trusts `cf-connecting-ip` first, then `x-real-ip`, then the last `x-forwarded-for` hop. Behind InstaCloud's Cloudflare edge, a client couldn't set `cf-connecting-ip` (Cloudflare rejects it; see L10 in `docs/security-review.md`). Vercel has no Cloudflare in front, so a client can send any `cf-connecting-ip` and pick their own IP. That gets past the per-IP rate limit on the paid chat route.

## Steps
1. Read the client IP only from what **Vercel** sets and overwrites, e.g. `ipAddress()` from `@vercel/functions`, or the header Vercel documents as trusted. Link the Vercel docs you relied on in the PR. Never read `cf-connecting-ip` again.
2. Keep Arcjet's `ipSrc`: pass it the same trusted IP, and only when it's a valid IP (as #80 does).
3. Local dev, with no Vercel headers, still works and falls back to a fixed key.
4. Tests:
   - a forged `cf-connecting-ip` is ignored
   - a client-sent `x-forwarded-for` / `x-real-ip` can't change the IP Vercel reports
   - the limit still counts per route + key + IP
5. `docs/security-review.md`: update L10 to describe the Vercel situation.

## Done when
- [ ] On a Vercel preview (once MV-T01 has it set up), the 21st chat message in a minute gets 429, even when each request forges a different `cf-connecting-ip` / `x-forwarded-for`. Until then, say what you could verify.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- **Decided 2026-10-26 (John, with Bob):** trust `x-real-ip` only when `VERCEL === "1"`. Vercel overwrites it to prevent spoofing, per vercel.com/docs/headers/request-headers. Off Vercel, use the fixed key `"unknown"`. No `@vercel/functions` dependency, since its `ipAddress()` only reads `x-real-ip`. It can merge before the cutover: InstaCloud `main` has no real visitors.
- CodeRabbit is required.
- New dependency `@vercel/functions` is fine if used. Name it in the PR body.
