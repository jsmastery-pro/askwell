# MV-T06 — `vercel.json` for Vercel's import

| Field | Value |
|---|---|
| Owner | Alice |
| Track | Platform move |
| Needs first | MV-T02 (#86) |
| Files allowed | `vercel.json` (new, repo root) |
| project.md | §3 Stack, §4 Environments |

## Why
On import, Vercel detects the monorepo and won't show the Deploy button without a `vercel.json` in its "services" format (product owner, 2026-10-26). Askwell has **one** deployable service: `apps/web`. `apps/widget` is built at build time and copied into `apps/web/public/widget.js`, and `packages/*` are libraries. Nothing calls another service, so there are **no bindings**.

Vercel's suggested file is a starting point:

```json
{ "services": { "web": { "root": "apps/web", "framework": "nextjs" } },
  "rewrites": [ { "source": "/(.*)", "destination": { "service": "web" } } ] }
```

Its gap: it builds `apps/web` alone, so `apps/widget/dist/widget.js` doesn't exist when `copy-widget` runs.

## Steps
1. Add `vercel.json` with one service, `web` (root `apps/web`, framework `nextjs`), and the catch-all rewrite to it.
2. Make the service's build run the workspace build first, so the widget is built before web. Use the command #86 verified: `cd ../.. && pnpm exec turbo run build --filter=@askwell/web`. Check Vercel's services docs (https://vercel.com/docs/services) for where `buildCommand` and `installCommand` go per service, and whether files outside `apps/web` (the workspace and lockfile) are included. If the docs are blocked in your sandbox, call `request_access` for vercel.com.
3. Keep `next.config.ts` as is. `headers()` and the `/ingest` rewrites stay in Next.js; don't move them into `vercel.json`.
4. Validate the file against Vercel's schema (`$schema`), and run the build command locally from a clean checkout to prove `widget.js` ends up in `apps/web/public`.

## Done when
- [ ] `vercel.json` has one public service (`web`) and no bindings, and its build produces `widget.js` before `next build`
- [ ] The PR body says which Vercel docs you followed and anything you couldn't verify without an account
- [ ] The product owner can import and deploy with it, and the first preview serves `/`, `/widget.js` and `/embed`

## Notes
- Config only. CodeRabbit is optional (no API, auth, DB, shared or widget-bundle code changes).
