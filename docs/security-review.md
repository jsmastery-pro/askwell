# Security review (P6-T01)

Audit of every project.md §9 rule against `main` at `7383d7e`, 2026-10-18, by John. Read-only. P6-T02 fixes the findings below.

**Result:** no high-severity findings. 3 medium, 1 low/medium, several low. Most rules pass outright.

## Findings

| ID | Severity | Rule | Where | What breaks | Fix | Status |
|---|---|---|---|---|---|---|
| M1 | medium | Cost abuse | `app/api/widget/chat/route.ts:34` | The public chat route parses a JSON body of any size, before validation and before the rate limit. Multi-MB bodies cost memory and CPU on every call. | Reject with `413` when `Content-Length` is over ~16 KB (or the body read exceeds it), before parsing. | P6-T02 |
| M2 | medium | Cost abuse | `app/api/projects/[id]/knowledge/route.ts:45-61` | Pasted text doesn't count toward any limit, and each paste can be 10 MB. Any free account can script unlimited pastes, and every one is embedded on our OpenAI key. | Decided 2026-10-18 (product owner): pasted text counts toward the same per-project limit as files, **Free 3 / Pro 25 sources in total**. `knowledgeFilesPerProject` becomes `knowledgeSourcesPerProject`. | P6-T02 |
| M3 | medium | Cost abuse | `lib/rate-limit/index.ts:58-61` | With `ARCJET_KEY` unset, every request is allowed, so paid AI calls have no per-minute limit. | Decided 2026-10-18: in production, `POST /api/widget/chat` returns `503` when the key is unset. Check in the route before calling the limiter. Config route and Arcjet-outage fail-open stay as they are. May need a new `ERROR_CODES` entry. | P6-T02 |
| LM4 | low/medium | File upload | `app/api/projects/[id]/knowledge/route.ts:67` | The whole multipart body is read into memory before the 10 MB check. Owner-only, but a huge upload costs memory. | Check `Content-Length` before reading. | P6-T02 |
| L5 | low | Webhook | `app/api/clerk/webhook/route.ts` | Event order isn't enforced. A late or retried `subscriptionItem.active` arriving after `subscriptionItem.ended` re-grants Pro. | On `active`, confirm the subscription is still active with Clerk's backend API before writing. | P6-T02, if cheap |
| L6 | low | CORS | `app/api/widget/config/route.ts:42` | A DB error escapes as a raw 500 with no CORS headers. It fails closed (no widget), but differs from the chat route. | `try/catch` → JSON 500 with CORS headers. | P6-T02 |
| L7 | low | Clickjacking | `next.config.ts` headers | `/embed/<anything>` matches neither header rule, so it gets no frame header. No such routes exist today, so only a 404 page is affected. | Make the `/embed` rule cover exactly `/embed` and the other rule cover everything else, including `/embed/…`. | P6-T02 |
| L8 | low | Cost abuse | `lib/chat/index.ts:96` | The question is embedded even when the project has no chunks. | Skip the embedding (and the model) when the project has no `ready` chunks. | P6-T02 |
| L9 | low | — | `proxy.ts:9` | Still protects `/api/billing(.*)`, which no longer exists. Harmless. | Remove the entry. | P6-T02 |
| L10 | low | Cost abuse | `lib/rate-limit/index.ts:86-92` | `getClientIp` trusts `cf-connecting-ip`. If the origin can be reached without going through Cloudflare, the header can be forged to dodge the per-IP limit. The monthly quota still caps cost. | Confirm InstaCloud only serves through its edge. If so, no change. | Bob to confirm |
| L11 | low | — | `lib/rate-limit` | Arcjet logs a WARN about `ip.src` from an unverified forwarding header. Our limit doesn't use `ip.src`. | Add Arcjet's `proxies` option if the installed `@arcjet/next` supports it. Otherwise leave it. | Optional |

## Notes (no fix needed)

- **Prompt-leak guard** (`lib/chat/answer.ts:29-36`): matches exact prompt prefixes only, so paraphrases get past it. It's a backstop behind the prompt's own rule. Acceptable.
- **`/embed?origin=`**: the page that frames `/embed` chooses `parentOrigin`. The panel only sends close, resize and unread counts, never chat content, so nothing leaks. Worth a code comment.
- **Race at the quota limit:** a request that loses the race still pays for one model call. Bounded by requests in flight.
- **PostHog on scale-to-zero:** there's no `shutdown()`, so a final event may be lost when the container stops. Analytics only, not security.

## Passing rules

| Rule | Evidence |
|---|---|
| Plan bypass | Every gate reads the plan on the server. Project limit: `lib/projects/index.ts:49-56`, with a locked account row. File limit: `knowledge/route.ts:89-103`, with a locked project row. Customize: `config/route.ts:33-36` returns 402 before parsing. Widget config: `lib/widget-config/index.ts:26,48`. Chat quota: `lib/chat/index.ts:73,92`. |
| Tenant leak | Every owner route and page checks ownership with `getOwnedProject` before any read, and malformed IDs give 404 (`packages/db/queries/projects.ts:21`). Single-record routes (`conversations/[id]`, `knowledge/[id]`) re-check the record's project. Chunk search always filters by project (`packages/db/queries/chunks.ts:33`). |
| Public key abuse | Public routes resolve the project by key only and return only the plan-applied config or the reply. Another project's `conversationId` gets 404. `posthog-config` returns only the public key and host. |
| Prompt injection | The system prompt is sent separately as `instructions`. Document and visitor text are tagged, and tags are neutralized case-insensitively. Other projects' data can't be reached. |
| File upload | Extension allowlist, 10 MB limit and PDF magic check on the server. The file limit is atomic. Storage keys stay private and are never returned. Delete is owner-checked and removes the row, then the object. |
| XSS | No `dangerouslySetInnerHTML`, `innerHTML` or similar anywhere. The loader writes only `textContent`, attributes and validated style values (`buttonColor` must match `^#[0-9a-fA-F]{6}$`). |
| CORS | `Access-Control-Allow-Origin: *` only on `widget/config` and `widget/chat`, with no credentials. Owner routes and `posthog-config` send no CORS headers. Middleware protects every owner route. |
| postMessage | Loader and panel check both `origin` and `source`. Messages only go to an exact origin, never `*`. |
| Clickjacking | Every page except `/embed` sends `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`. Bob verified it on his deploy. See L7 for the `/embed/…` edge. |
| Webhook | Signature checked before any write. Writes only for the Pro plan's slug. Redeliveries change nothing. See L5. |
| Secrets | The only `NEXT_PUBLIC_*` values are the app URL, Clerk's publishable key and sign-in/up URLs, and PostHog's public key and host. No client file or widget code reads `process.env`. |
| PR #77 (never reviewed by CodeRabbit) | `first_chat` fires once, decided under the project-row lock. No visitor content goes to PostHog. Events go to the owner, after the save. No trace when the model is skipped. Capture can't affect the reply. |

## Open review threads on merged PRs

- **Fixed later without a reply in the thread:** #66 (webhook downgrade and slug gating, fixed in #67), #63 (demo timer, fixed in `761a53b`), #59 (spec alignment, fixed in #71). John replies on each.
- **Minor docs threads still open:** #44 (CLAUDE.md doesn't mention the 2026-10-13 CodeRabbit-optional rule; UI-T05 prerequisite), #46 (UI-T06 usage-API pointer; tracker vs checklists), #57 (hex examples in ui-track). John handles these in a docs PR.
- **#49 focus-ring contrast:** moved into P6-T04's polish pass.

## Unverified

- Whether `verifyWebhook` rejects requests when `CLERK_WEBHOOK_SIGNING_SECRET` is unset. Expected: the library reads it implicitly and throws, giving 400. P6-T02 adds a test.
- Whether the installed `@arcjet/next` version supports `proxies` (L11).
