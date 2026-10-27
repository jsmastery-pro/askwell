# Security review (P6-T01)

Audit of every project.md §9 rule against `main` at `7383d7e`, 2026-10-18, by John. Read-only. P6-T02 fixes the findings below.

**Result:** no high-severity findings. 3 medium, 1 low/medium, several low. Most rules pass outright.

## Findings

| ID | Severity | Rule | Where | What breaks | Fix | Status |
|---|---|---|---|---|---|---|
| M1 | medium | Cost abuse | `app/api/widget/chat/route.ts:34` | The public chat route parses a JSON body of any size, before validation and before the rate limit. Multi-MB bodies cost memory and CPU on every call. | Reject with `413` when `Content-Length` is over ~16 KB (or the body read exceeds it), before parsing. | **Fixed in #80**: 16 KB cap on header and actual bytes, 413 before parsing |
| M2 | medium | Cost abuse | `app/api/projects/[id]/knowledge/route.ts:45-61` | Pasted text doesn't count toward any limit, and each paste can be 10 MB. Any free account can script unlimited pastes, and every one is embedded on our OpenAI key. | Decided 2026-10-18 (product owner): pasted text counts toward the same per-project limit as files, **Free 3 / Pro 25 sources in total**. `knowledgeFilesPerProject` becomes `knowledgeSourcesPerProject`. | **Fixed in #80**: one atomic source limit for text and files; renamed; UI says sources |
| M3 | medium | Cost abuse | `lib/rate-limit/index.ts:58-61` | With `ARCJET_KEY` unset, every request is allowed, so paid AI calls have no per-minute limit. | Decided 2026-10-18: in production, `POST /api/widget/chat` returns `503` when the key is unset. Check in the route before calling the limiter. Config route and Arcjet-outage fail-open stay as they are. May need a new `ERROR_CODES` entry. | **Fixed in #80**: production 503 `service_unavailable` before the limiter |
| LM4 | low/medium | File upload | `app/api/projects/[id]/knowledge/route.ts:67` | The whole multipart body is read into memory before the 10 MB check. Owner-only, but a huge upload costs memory. | Check `Content-Length` before reading. | **Fixed in #80**: `Content-Length` checked before the body is read (413) |
| L5 | low | Webhook | `app/api/clerk/webhook/route.ts` | Event order isn't enforced. A late or retried `subscriptionItem.active` arriving after `subscriptionItem.ended` re-grants Pro. | On `active`, confirm the subscription is still active with Clerk's backend API before writing. | **Fixed in #80**: Pro is set only if Clerk's billing API shows a Pro item active now; Clerk unreachable → 500 so Svix retries |
| L6 | low | CORS | `app/api/widget/config/route.ts:42` | A DB error escapes as a raw 500 with no CORS headers. It fails closed (no widget), but differs from the chat route. | `try/catch` → JSON 500 with CORS headers. | **Fixed in #80** |
| L7 | low | Clickjacking | `next.config.ts` headers | `/embed/<anything>` matches neither header rule, so it gets no frame header. No such routes exist today, so only a 404 page is affected. | Make the `/embed` rule cover exactly `/embed` and the other rule cover everything else, including `/embed/…`. | **Fixed in #80**: only exactly `/embed` is framable; tested with Next's matcher |
| L8 | low | Cost abuse | `lib/chat/index.ts:96` | The question is embedded even when the project has no chunks. | Skip the embedding (and the model) when the project has no `ready` chunks. | **Fixed in #80**: no embedding or model call without a `ready` source's chunks |
| L9 | low | — | `proxy.ts:9` | Still protects `/api/billing(.*)`, which no longer exists. Harmless. | Remove the entry. | **Fixed in #80** |
| L10 | low | Cost abuse | `lib/rate-limit/index.ts:86-92` | `getClientIp` trusts `cf-connecting-ip`. If the origin can be reached without going through Cloudflare, the header can be forged to dodge the per-IP limit. The monthly quota still caps cost. | Confirm InstaCloud only serves through its edge. If so, no change. | **Fixed in #85 for Vercel (MV-T05); live check pending a Vercel preview.** With no Cloudflare in front, `cf-connecting-ip` became forgeable. `getClientIp` now reads only `x-real-ip`, and only when `VERCEL=1`: Vercel overwrites `x-forwarded-for` "to prevent IP spoofing" and `x-real-ip` is identical to it (https://vercel.com/docs/headers/request-headers). `cf-connecting-ip` and `x-forwarded-for` are never read. Off Vercel, every request shares the fixed key `unknown`. (InstaCloud history, #80: Cloudflare rejected a client-sent `cf-connecting-ip`; that platform is being retired.) |
| L11 | low | — | `lib/rate-limit` | Arcjet logs a WARN about `ip.src` from an unverified forwarding header. Our limit doesn't use `ip.src`. | Add Arcjet's `proxies` option if the installed `@arcjet/next` supports it. Otherwise leave it. | **Fixed in #80**: Arcjet gets our trusted IP as `ipSrc`; `proxies: [cloudflare()]` didn't apply (Arcjet read `x-forwarded-for`); the WARN is gone |

## Notes (no fix needed)

- **Prompt-leak guard** (`lib/chat/answer.ts:29-36`): matches exact prompt prefixes only, so paraphrases get past it. It's a backstop behind the prompt's own rule. Acceptable.
- **`/embed?origin=`**: the page that frames `/embed` chooses `parentOrigin`. The panel only sends close, resize and unread counts, never chat content, so nothing leaks. Worth a code comment.
- **Race at the quota limit:** a request that loses the race still pays for one model call. Bounded by requests in flight. **Closed by SB-T05** (Supabase-native): `consume_message` counts the message atomically before the embedding and model call, so a request over the limit never reaches OpenAI. Trade-off: a model error now still uses one message of quota.
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

All closed on 2026-10-20 (John):

- **Fixed later, now answered in the thread:** #66 (plan-slug gating, downgrade on `ended`: fixed in #67), #63 (demo timer: fixed in `761a53b`), #59 (spec alignment: fixed in #71).
- **Fixed in #82:** #44 (`CLAUDE.md` now matches plan.md's review rule; UI-T05's prerequisite).
- **Answered, no change:** #46 (task-file checkboxes vs the tracker; the usage follow-up was superseded by UI-T08 and P3-T05), #57 (the `#4f46e5` example is data, not a styling color).
- **#49 focus-ring contrast:** checked in P6-T04 (#81), all rings at 3:1 or better.

## Unverified

- ~~Whether `verifyWebhook` rejects requests when `CLERK_WEBHOOK_SIGNING_SECRET` is unset.~~ **Verified in #80:** with the secret unset, a correctly signed request gets 400 and nothing changes (webhook route test).
- ~~Whether the installed `@arcjet/next` version supports `proxies` (L11).~~ **Answered in #80:** it does, but on InstaCloud Arcjet resolves the IP from `x-forwarded-for`, so `cloudflare()` didn't apply. #80 passes a validated `ipSrc` instead.

---

# Supabase-native audit (SB-T09)

Audit of every RLS policy, table and column grant, function grant, Storage setting and Supabase advisor finding after the Supabase-native track (#92–#99), against `main` at `f982e41`, 2026-10-27, by John. The database facts are read-only query results from the dev project (`pasgozggqtprenfgtghb`), collected by Bob through the MCP. The code checks are mine, on `main`.

**Result:** no high or medium findings. 2 low, 2 informational. The design in `project.md` §7 matches the live database.

## Findings

| ID | Severity | Where | What | Fix | Status |
|---|---|---|---|---|---|
| S1 | low | `public.rls_auto_enable()` (Supabase's own, created by the project's "auto-enable RLS" setting) | SECURITY DEFINER, and `PUBLIC`, `anon` and `authenticated` all have EXECUTE. Advisor lints 0028/0029. Called as `anon` through `/rest/v1/rpc` (GET and POST), it returns 400 `0A000` ("cannot display a value of type event_trigger"). Postgres doesn't run an event-trigger function outside its trigger, so it does nothing, but nothing should be able to call it. | A migration that revokes EXECUTE from `PUBLIC`, `anon` and `authenticated`, guarded so it skips a project where the function doesn't exist. | Open (fix task) |
| S2 | low | Storage bucket `askwell` (dev) | The pre-SB-T06 bucket: private, but with no size or type limit. Nothing has used it since #96. Its objects are throwaway. | Delete it on dev. Prod must only have `knowledge` (P6-T05 cutover step 5 checks this). | Open (product owner, dashboard) |
| S3 | info | `owned_project_ids()`, `owned_conversation_ids()` | SECURITY DEFINER and executable by `authenticated`, so an owner can call them through `/rest/v1/rpc` (lint 0029). They return only the caller's own IDs (`auth.jwt()->>'sub'`), which the owner can already read. `anon` can't execute them. | None needed. Optional hardening: move them to a schema the Data API doesn't expose. | Accepted |
| S4 | info | Policies on `accounts` and `projects` | Performance lint 0003 (`auth_rls_initplan`). The stored policies already use `(select auth.jwt() ->> 'sub')`, the form the lint asks for, so this looks like a false positive. Not checked with `EXPLAIN` (dev has no rows). | Re-run the advisor on prod after launch data exists; check with `EXPLAIN` if it persists. | Accepted |

Also from the advisor: `knowledge_chunks_embedding_idx` unused (INFO 0005), expected with 0 rows.

## Passing checks

| Check | Evidence |
|---|---|
| RLS on every table | All 7 `public` tables have RLS on. All Storage tables have RLS on. |
| Policies | 9, all for `authenticated`: SELECT on all 7 tables (own rows: `owner_id`/`clerk_user_id = (select auth.jwt()->>'sub')`, or `project_id in owned_project_ids()`, or `conversation_id in owned_conversation_ids()`), plus UPDATE and DELETE on own `projects`. No policy for `anon`. No Storage policies. |
| `anon` | No table grant, no column grant and no EXECUTE on any of our functions. |
| `authenticated` writes | Table grants: SELECT on all 7, plus DELETE on `projects`. Column grants: UPDATE on `projects.name` only. So an owner can't change `owner_id`, `public_key`, `messages_used`, `period_start` or their plan. |
| `service_role` | SELECT, INSERT, UPDATE and DELETE on the 7 tables. No TRUNCATE, REFERENCES or TRIGGER on `public` (TRUNCATE revoked from every API role). |
| Limit functions | `create_project`, `reserve_knowledge_source`, `consume_message`, `save_chat_turn`, `match_chunks` and `add_one_month`: SECURITY INVOKER, `search_path=""`, EXECUTE for `service_role` only. |
| `owner_activity` | SECURITY INVOKER, `search_path=""`, EXECUTE for `authenticated` only (not `service_role`, which would see every owner). Bob's dev check: owner A sees only A's rows; `anon` and `service_role` get 42501. |
| `search_path` | Pinned to `''` on all 9 of our functions. |
| Storage | `knowledge` bucket: private, 10,485,760 bytes, `application/pdf`, `text/markdown`, `text/plain`. No Storage policies, so only the secret key or a one-time signed upload URL reaches it. |
| Secret key | `SUPABASE_SECRET_KEY` is read only in `apps/web/lib/supabase/service.ts`, which imports `server-only`. No `"use client"` file and no widget code imports it. The widget bundle has no Supabase code at all. |
| Owner reads | Owner pages and routes read through `createOwnerClient()` (RLS). The service client is used only by visitor routes, the webhook, knowledge processing, Storage, sign-up and the gated writes (create project, reserve and finalize a source, save widget config), each after the route checks ownership and plan. |
| Aggregates | PostgREST aggregates stay off. The one embedded `messages(count)` was verified against dev in #95 (200, no PGRST123). |

## Not verified

- Prod. Everything above is dev. P6-T05's cutover runs the security advisor on prod before promoting.
- That `rls_auto_enable()`'s body never runs when called through the API. Inferred from Postgres's rule for event-trigger functions plus the 400; no server logs were read.
