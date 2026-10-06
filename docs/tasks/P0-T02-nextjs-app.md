# P0-T02 — Next.js app

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P0-T01 |
| Files allowed | `apps/web/**`, `pnpm-lock.yaml` |
| project.md | §3 Stack, §5 Plans (the "Name" rule only), §10 Repo layout |

## Goal
Add the Next.js app in `apps/web`. It should build, run, and show a placeholder home page.

## Steps
1. Create `apps/web` with Next.js (App Router), TypeScript and Tailwind. It extends `tsconfig.base.json` and the root ESLint config.
2. Set `output: 'standalone'` in `next.config` and configure it for the monorepo: `outputFileTracingRoot` points at the repo root, and `transpilePackages` includes `@askwell/shared`, or whatever name T01 gave the package.
3. Add `packages/shared` as a dependency.
4. Home page (`/`): a placeholder that shows `APP_NAME` from `packages/shared`, styled with Tailwind. Set the page title from `APP_NAME` too.
5. Create `apps/web/components/`. Put the first shared UI piece there, for example a `Container`.
6. Add one Vitest test in `apps/web`, for example one that renders the home page or a pure helper.

## Done when
- [ ] `pnpm dev` serves `/`, and it shows "Askwell" from `APP_NAME`
- [ ] A Tailwind class visibly applies on the page
- [ ] `pnpm build` creates `apps/web/.next/standalone`
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` all pass at the root
- [ ] "Askwell" doesn't appear as a hardcoded string in `apps/web`, except in test assertions

## Notes
- The home page is a placeholder. The real landing page is Phase 1, Lane B (§6.1). Don't build its sections yet.
- No Clerk, database or env vars in this task.
- If you need to edit a root file (for example `turbo.json`), stop and ask.
