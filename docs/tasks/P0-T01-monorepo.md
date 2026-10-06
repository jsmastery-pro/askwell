# P0-T01 — Monorepo + tooling

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | none |
| Files allowed | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.*`, `vitest.config.*`, `.gitignore`, `.npmrc`, `.nvmrc`, `packages/shared/**`, `packages/db/**`, `apps/widget/**` |
| project.md | §3 Stack, §5 Plans (the "Name" rule only), §10 Repo layout |

## Goal
Set up the pnpm monorepo and the shared tooling, so every later task has working `typecheck`, `lint`, `test` and `build` commands.

## Steps
1. Root setup: pnpm workspaces plus Turborepo. Pin Node 22 LTS in `.nvmrc` and in `engines`.
2. Root scripts: `dev`, `typecheck`, `lint`, `test`, `build`, `db:generate` and `db:migrate`. Each one runs through Turbo across the workspace.
3. Add `tsconfig.base.json` with `strict: true`. Every package extends it.
4. Add ESLint with flat config and TypeScript rules, including `no-explicit-any` as an error.
5. Add Vitest at the root.
6. `packages/shared`: export `APP_NAME = "Askwell"`. Add one test for it.
7. `packages/db`: Drizzle, `drizzle-kit`, `drizzle.config.ts` that reads `DATABASE_URL`, and an empty `schema/index.ts`. Add the `db:generate` and `db:migrate` scripts. Don't add any tables.
8. `apps/widget`: vanilla TypeScript with one empty entry file. The `build` script bundles it to `dist/widget.js` with esbuild or tsup.
9. Add `.gitignore` covering `node_modules`, `.env`, `.env.*` (but not `.env.example`), `ROLE.md`, `.DS_Store`, `dist`, `.next` and `.turbo`.

## Done when
- [ ] A fresh clone runs `pnpm install` with no errors
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` all pass
- [ ] `pnpm test` runs the `APP_NAME` test, and it passes
- [ ] `pnpm build` produces `apps/widget/dist/widget.js`
- [ ] `.gitignore` covers `.env` and `ROLE.md`
- [ ] Adding an `any` to a file makes `pnpm lint` fail. Check this, then revert it.

## Notes
- `apps/web` doesn't exist yet; it comes in P0-T02. Root scripts must work without it.
- `pnpm db:migrate` needs a database, so it doesn't have to pass here. It only has to exist.
- `packages/shared` holds only `APP_NAME`. Types and plan limits come in Phase 1.
- Don't add `turbo` remote caching or any paid service.
- `ROLE.md` is committed to `main` today. Don't `git rm` it yourself. Removing it from Git would delete each agent's local copy on pull. Stop and ask the product owner if it's still tracked when you start.
