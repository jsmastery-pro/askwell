# P4-T03 — PostHog setup: wizard, events, funnel, session replay, error tracking

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | B (normally Alice's — she's on Phase 3 Lane B; product owner approved giving this to Bob, 2026-10-17) |
| Needs first | — |
| Files allowed | `apps/web/package.json`, `pnpm-lock.yaml`, `.env.example`, `apps/web/instrumentation*.ts`, `apps/web/app/layout.tsx`, `apps/web/app/dashboard/account.ts`, `apps/web/lib/projects/**`, `apps/web/app/api/projects/[id]/knowledge/route.ts` (knowledge_added, via the shared `created()` helper), `apps/web/components/projects/CopyButton.tsx` (snippet_copied), `apps/web/app/api/clerk/webhook/route.ts` (upgraded, on `setPlan(userId, "pro")`), `apps/web/next.config.ts` (add the `/ingest` reverse-proxy `rewrites()` entry only — never touch `headers()`), `pnpm-workspace.yaml` (one line: `core-js: false` under `allowBuilds`, so `pnpm install --frozen-lockfile` in the Dockerfile doesn't fail on core-js's postinstall), `apps/web/lib/posthog/**` (shared server client + never-throws capture helper), `apps/web/app/api/posthog-config/**` (runtime config route, see Notes), `next.config.ts` may also set `skipTrailingSlashRedirect: true` (PostHog's `/ingest/e/` path otherwise 308s, which `sendBeacon` won't follow), co-located tests for every file that gets an event (`account.test.ts`, knowledge `route.test.ts`, webhook `route.test.ts`, new `CopyButton.test.tsx`), `apps/web/components/dashboard-nav/AccountMenu.tsx` (identify on sign-in with the Clerk user ID only, reset on sign-out — no email/name), `apps/web/app/global-error.tsx` (new: capture + minimal fallback using `APP_NAME`) — plus any other existing file where you add a **single PostHog event call and nothing else**. Ask before touching anything that needs more than that one-line addition. |
| project.md | §6.11 Analytics |

## Background
Product owner has a PostHog account/project ready. This is **not** the owner-facing dashboard analytics (that's already wired, P4-T01/T02) — this is PostHog itself: product analytics, session replay, error tracking, AI tracing.

**Scope cut for this task**: skip the `first_chat` event and the AI trace in the chat route. Both depend on the chat route and embed panel, which are Alice's in-progress Phase 3 work (`apps/web/lib/chat`, `apps/web/app/embed`, `apps/web/components/widget-panel`) — don't touch those. A follow-up task adds those two once Phase 3 Lane B merges.

## Steps
1. Run `npx @posthog/wizard` against this Next.js app. It creates `NEXT_PUBLIC_POSTHOG_KEY`/`NEXT_PUBLIC_POSTHOG_HOST`, installs the client, and wires the provider/instrumentation files. Add the two vars to `.env.example` (no real values committed).
2. **Events** — one line each, fired where the action actually completes:
   - `signed_up`: first-sign-in account creation (`apps/web/app/dashboard/account.ts` looks like where the `accounts` row is created — verify before assuming).
   - `project_created`: on successful project creation (`apps/web/lib/projects`).
   - `knowledge_added`: on a successful add (text or file) — find the real success path in the Knowledge flow (P3-T02/T03's code) and ask if it's not a one-line addition.
   - `snippet_copied`: the Install page's copy-to-clipboard action.
   - `upgraded`: the Clerk webhook, when `accounts.plan` flips to `pro` (`apps/web/app/api/clerk/webhook/route.ts`) — ask to add this one file if it's not already in your list.
3. **Funnel**: landing → sign up → project → knowledge → install. (Stop there — `first_chat`/`upgraded` steps of the full funnel in project.md §6.11 need the skipped pieces above; note this in the PR.)
4. **Session replay**: on for the dashboard and the landing page (PostHog wizard/config setting), off everywhere else (never on `/embed` — visitor chat content shouldn't be recorded).
5. **Error tracking**: client and server exceptions captured (PostHog's exception autocapture / wizard default).
6. Tests: each event call fires with the right properties (mock the PostHog client); nothing breaks if `NEXT_PUBLIC_POSTHOG_KEY` is unset (local dev without it still works).

## Done when
- [ ] PostHog wizard installed and configured; keys read from env, never hardcoded
- [ ] All 5 in-scope events fire at the right moment with sane properties
- [ ] Session replay is on for dashboard + landing, off for `/embed`
- [ ] Client and server errors reach PostHog
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- **Client key at runtime (decided 2026-10-17):** InstaCloud injects env only at runtime and has no build-arg flag, so a `NEXT_PUBLIC_POSTHOG_KEY` inlined at build is empty in deployed images. The client fetches the public key and host from `GET /api/posthog-config` (public, short cache, returns nothing else) before `posthog.init`, and init is a no-op without a key. Same reason `components/projects/snippet.ts` reads `NEXT_PUBLIC_APP_URL` at request time. Never fetched from `/embed`.
- No secret in `NEXT_PUBLIC_*` beyond what PostHog's own client key is designed for (it's meant to be public).
- Don't touch anything in Alice's Phase 3 Lane B territory (`lib/chat`, `app/embed`, `components/widget-panel`) — `first_chat` and AI tracing come later.
- This is cross-cutting by nature (small additions across several existing files) — ask for any file not already listed before touching it, same as every other task this session.
