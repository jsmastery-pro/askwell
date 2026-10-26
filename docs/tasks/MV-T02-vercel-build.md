# MV-T02 — Build and run on Vercel; remove InstaCloud

| Field | Value |
|---|---|
| Owner | Alice |
| Track | Platform move |
| Needs first | — (preview verification needs MV-T01) |
| Files allowed | `Dockerfile`, `.dockerignore`, `.insta/**` (delete), `.gitignore` (InstaCloud lines only), `vercel.json` (new, if needed), `turbo.json`, `package.json`, `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/app/api/projects/[id]/knowledge/route.ts` and `apps/web/app/api/widget/chat/route.ts` (a `maxDuration` export only), `apps/web/lib/posthog/server.ts`, `apps/web/lib/knowledge/background.ts`, `apps/web/lib/ai/**` and `apps/web/lib/chat/answer.ts` (OpenAI timeout and retries, added in review), plus InstaCloud-only **comments** anywhere in `apps/web/**` |
| project.md | §3 Stack, §4 Environments |

## Steps
1. **Monorepo build on Vercel:** pick the root directory and build command so `apps/widget` builds before `apps/web`, whose `copy-widget` copies `apps/widget/dist/widget.js`. Use `vercel.json` only if needed. Put the exact Vercel project settings in the PR body for the product owner (MV-T01 step 2).
2. **`next.config.ts`:** drop `output: "standalone"` if Vercel doesn't need it. Keep `headers()` exactly as is. Keep the `/ingest` rewrites, but note that Vercel provides build-time env, so the "InstaCloud has no build env" comment goes.
3. **Function time:** export `maxDuration` from the knowledge upload route (it covers its `after()` ingest) and the chat route. Pick values that fit Vercel's free tier, and say which in the PR. A 4 MB PDF must reach `ready`.
3b. **OpenAI time budget (from CodeRabbit on #86):** the OpenAI client defaults to a 10-minute timeout and 2 retries. Set `timeout` and `maxRetries` explicitly, so the chat route's worst case (embedding + completion, retries included) finishes inside its `maxDuration`, with margin to return our own JSON error.
4. **PostHog on serverless:** make sure server events are sent before the function freezes, e.g. flush inside `after()`, or capture with `waitUntil`. The reply path must still never wait on PostHog.
5. **Remove InstaCloud:** delete `Dockerfile`, `.dockerignore`, `.insta/`, and the `.insta` lines in `.gitignore`. Reword comments that cite InstaCloud. Behavior that reads env at runtime stays: it still works on Vercel and needs no rebuild.

## Done when
- [ ] A Vercel preview of this PR serves the landing page, `/widget.js`, and `/embed` with `frame-ancestors *` (and `'self'` elsewhere)
- [ ] A chat on the preview answers, and its PostHog events arrive
- [ ] A 4 MB PDF upload reaches `ready` on the preview (needs MV-T03 and MV-T04 merged)
- [ ] `grep -rni instacloud apps packages` finds only historical notes, if any
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- CodeRabbit is required (API routes).
