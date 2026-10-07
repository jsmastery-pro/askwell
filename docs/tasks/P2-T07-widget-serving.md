# P2-T07 — Serve widget.js, frame headers, cross-origin test

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | B |
| Needs first | P2-T05, P2-T06 |
| Files allowed | `apps/web/next.config.ts`, `apps/web/package.json`, `apps/web/public/**`, `apps/widget/package.json`, `apps/widget/test/**`, `turbo.json`, `Dockerfile`, `.gitignore`, `pnpm-lock.yaml` |
| project.md | §6.5 Widget, §6.9 Install, §9 Security rules (Clickjacking) |

## Goal
The web app serves `/widget.js`, only `/embed` can be framed by other sites, and a plain HTML page on another origin proves the full flow.

## Steps
1. Build `apps/widget` before `apps/web` and make `dist/widget.js` available at `/widget.js` in the web app (e.g. copy into `apps/web/public` at build; git-ignore the copy). Works in `pnpm dev`, `pnpm build`, and the Docker image.
2. Headers in `next.config.ts`: `/embed` → `frame-ancestors *`; every other path → `frame-ancestors 'self'`.
3. `apps/widget/test/index.html`: a plain page with the install snippet. Serve it on a different port (document the command in the PR).
4. Cache headers for `/widget.js`: short (e.g. 5 minutes) so updates roll out.

## Done when
- [ ] `curl -I <app>/widget.js` returns `200` and JavaScript content type, locally and on your InstaCloud env
- [ ] `curl -I <app>/dashboard` shows `frame-ancestors 'self'`; `curl -I <app>/embed?key=...` shows `frame-ancestors *`
- [ ] The test page on another origin shows the button; the panel opens and shows a mock reply
- [ ] Docker build still succeeds
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- This is the Phase 2 "Done when". Put a screenshot or short clip in the PR.
- The end-to-end check needs a real key, so it needs P2-T02 and P2-T03 merged. Steps 1, 2, 4 don't.
- Don't change Clerk auth in `apps/web/proxy.ts` (Next 16's `middleware.ts`); if `/embed` or `/widget.js` gets caught by auth, stop and ask.
