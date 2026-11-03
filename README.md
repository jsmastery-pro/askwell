# Askwell

An AI support chat widget for any website. See `docs/project.md` for what we build and `docs/plan.md` for the build order.

## Layout

| Path | What |
| --- | --- |
| `apps/web` | Next.js app: landing, dashboard, `/embed`, `/api` |
| `apps/widget` | Vanilla TS loader, bundled to `apps/widget/dist/widget.js` (esbuild, 5 kb budget) |
| `packages/shared` | The contract: types, API shapes, plan limits |
| `packages/db` | Generated Supabase types + pglite test helper (Phase 1) |

## Setup

Node 24 (`.nvmrc`) and pnpm (version pinned in `package.json` `packageManager`).

```bash
pnpm install
cp .env.example .env   # fill in values; never commit .env
pnpm dev               # http://localhost:3000
```

## Commands

| Command | Does |
| --- | --- |
| `pnpm dev` | Run the web app and rebuild the widget on change |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm lint` | ESLint across the workspace |
| `pnpm test` | Vitest across the workspace |
| `pnpm build` | Build the widget and the web app |
| `pnpm db:types` | Regenerate `packages/db/types.ts` from the Supabase dev project (see below) |

## Regenerating types

`pnpm db:types` writes `packages/db/types.ts` from the **dev** project's `public` schema, using the pinned Supabase CLI (`supabase@2.122.0` via `pnpm dlx`; nothing to install). Run it after a migration is applied to dev, and commit the result with that migration.

It needs a Supabase personal access token in your shell, not in `.env` (the app never reads it):

```bash
export SUPABASE_ACCESS_TOKEN=...   # a scoped token from supabase.com/dashboard/account/tokens
pnpm db:types
git diff packages/db/types.ts      # should show only the schema change you expect
```

If the CLI fails, `types.ts` is left unchanged. Agents don't run this: they use the Supabase MCP's type generator, which gives the same output.

## Vercel

| Setting | Value |
| --- | --- |
| Root Directory | `apps/web` ("Include files outside the root directory" on) |
| Framework | Next.js |
| Install Command | default (`pnpm install`, run at the repo root) |
| Build Command | default (`next build`) |
| Node.js | 24.x (from `engines`; it overrides the dashboard's Node.js Version) |
| pnpm | 12.16.1, picked up from `packageManager`. `ENABLE_EXPERIMENTAL_COREPACK` is not needed. |
| Production | Automatic promotion off |

Previews are protected. Send `x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET` with every request.
