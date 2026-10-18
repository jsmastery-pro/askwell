# P6-T02 — Security fixes

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P6-T01 (`docs/security-review.md`), and P6-T03 merged. Both touch `components/landing/Pricing.tsx`, so branch after it lands. |
| Files allowed | `apps/web/app/api/widget/chat/**`, `apps/web/app/api/widget/config/**`, `apps/web/app/api/projects/[id]/knowledge/**`, `apps/web/app/api/clerk/webhook/**`, `apps/web/lib/chat/**`, `apps/web/lib/knowledge/**`, `apps/web/lib/data/knowledge.ts`, `apps/web/lib/rate-limit/**` (L11 only), `apps/web/proxy.ts` (L9 only), `apps/web/next.config.ts` (L7: `headers()` sources only), `packages/shared/src/**` (one new `ERROR_CODES` entry, plus the M2 rename), and for the M2 rename and wording only: `apps/web/components/landing/Pricing.tsx`, `apps/web/components/knowledge/KnowledgeManager.tsx`, `apps/web/components/billing/**`, `apps/web/app/dashboard/billing/page.tsx`, `apps/web/app/dashboard/projects/[id]/page.tsx`, `apps/web/app/dashboard/projects/[id]/knowledge/page.tsx`. Co-located tests of all of these. |
| project.md | §9 Security rules, §5 Plans, §6.4 Knowledge |

## Goal
Fix the findings in `docs/security-review.md` (IDs below match the report). Then mark each one fixed in the report, with the PR number.

## Fixes

| ID | Fix |
|---|---|
| M1 | `POST /api/widget/chat`: reject bodies over ~16 KB with `413` (`invalid_input` or a new code) **before** parsing. Check `Content-Length`, and cap the actual read too, since the header can be missing or wrong. |
| M2 | **Decided 2026-10-18 (product owner):** pasted text counts toward the same per-project limit as files: **Free 3, Pro 25 knowledge sources in total.**<br>• Rename `PLAN_LIMITS[plan].knowledgeFilesPerProject` → `knowledgeSourcesPerProject` in `packages/shared`, and update every use.<br>• Count all of the project's sources in the atomic limit check, text included.<br>• UI copy says "sources", not "files": the Knowledge page counter, Billing comparison, landing Pricing.<br>• Existing projects over the new limit keep their sources; they just can't add more. |
| M3 | **Decided 2026-10-18 (product owner):** in production, `POST /api/widget/chat` returns `503` with a clear error code when `ARCJET_KEY` is unset.<br>• Check it in the route, before the limiter.<br>• `GET /api/widget/config`, Arcjet-outage fail-open, and local dev without the key are unchanged.<br>• Add the code to `ERROR_CODES`. The panel shows its generic error for it. |
| LM4 | Knowledge upload: check `Content-Length` against the 10 MB limit (plus a little multipart overhead) before reading the body. |
| L5 | Webhook: on `subscriptionItem.active`, confirm with Clerk's backend API that the subscription is still active before setting `pro`, so a late or retried event can't re-grant Pro after it ended. If that isn't cheap, say so in the PR and leave it as is. |
| L6 | `GET /api/widget/config`: wrap the lookup in `try/catch` and return a JSON 500 with CORS headers. |
| L7 | `next.config.ts` headers: give `/embed` exactly `frame-ancestors *`, and give every other path, `/embed/…` included, `'self'` + `X-Frame-Options`. |
| L8 | Chat: skip the embedding and the model when the project has no `ready` chunks, and reply with `DONT_KNOW_REPLY`. |
| L9 | `proxy.ts`: remove the dead `/api/billing(.*)` entry. |
| L10 | Confirm whether InstaCloud's origin can only be reached through its edge. Report in the PR; change nothing unless it can be bypassed. |
| L11 | Optional: add Arcjet's `proxies` option if the installed `@arcjet/next` supports it. |
| — | Test that the webhook rejects requests when `CLERK_WEBHOOK_SIGNING_SECRET` is unset (unverified in the audit). |

## Done when
- [ ] M1–M3 and LM4 fixed with tests; L5–L9 fixed or explained; L10 and L11 reported
- [ ] `docs/security-review.md` marks each finding fixed (with PR) or answered
- [ ] Live on your deploy:
  - an oversized chat body gets 413
  - a 4th source on a Free project is refused, text included
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- CodeRabbit is required (API routes, `packages/shared`, chat).
- `docs/security-review.md` is in scope for marking findings fixed only.
