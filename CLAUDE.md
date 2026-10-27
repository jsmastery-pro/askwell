@ROLE.md

# Askwell — Team Rules

Askwell is an AI support chat widget for any website. Three agents build it as a team. Every agent follows this file. Your own role is in `ROLE.md` (imported above).

**If you don't know your name and role, `ROLE.md` is missing. Stop and ask the product owner before doing anything.**

## Docs

| File | Read it for |
|---|---|
| `docs/project.md` | What we build: features, data model, API routes, security rules |
| `docs/plan.md` | Build order, every task, and its status |
| `docs/tasks/*.md` | One task each. Read only the tasks you own. |

Read only the `project.md` sections your task lists. Don't load the whole file.

## The team

| Member | Role |
|---|---|
| Product owner (human) | Approves plans, answers questions, merges PRs, deploys `main` |
| John | Lead engineer. Breaks phases into tasks, assigns them, reviews PRs. Writes no app code. |
| Bob, Alice | Developers. Build the tasks assigned to them. |
| CodeRabbit | Reviews PRs and ranks the PR queue. Required on any PR that touches a required area in `docs/plan.md`'s review rule: API routes, auth, the database/migrations, `packages/shared`, the widget bundle, billing, chat/RAG. That includes UI PRs touching one of these, e.g. billing components. Optional only on PRs that touch none of them (UI-only, docs-only). If it comments, answer every thread. |

You can't reach the other agents. Sandboxes are isolated. If you need something from another agent, tell the product owner.

## How to talk to the product owner

- Lead with the answer or result. No preamble, no recap at the end.
- Short sentences, plain words. No paragraph over 3 sentences.
- A table for comparisons, a numbered list for steps. Plain text for a short answer.
- Need a decision? Use the AskUserQuestion tool: 2–4 options, recommended first, marked "(Recommended)", one line on why each.
- One decision at a time unless they're linked. Never more than 3.
- Say what you know vs. what you're guessing.

## Working on a task

1. `git checkout main && git pull`
2. Read your task file and the `project.md` sections it lists.
3. Check "Needs first". If a needed task isn't `done` in `plan.md`, use the mocks in the task's Notes, or stop and ask.
4. Create a branch: `<your-name>/<task-id>-<short-name>`, e.g. `bob/P3-T02-chat-route`
5. Build. Edit only the paths in "Files allowed".
6. Run all checks (see Commands). All must pass.
7. Commit in small steps. Message: `P3-T02: add rate limit check`
8. Push and open one PR for the task: `gh pr create --title "[P3-T02] Chat route"`. Body: what changed, how you tested, the "Done when" list with each box checked or explained.
9. Vercel deploys a preview of every PR. Check your change on it, and put the preview URL in the PR.
10. Tell the product owner the PR is ready.

Task status lives only in `docs/plan.md`. Only John edits it.

## When you must stop and ask

| Situation | Do |
|---|---|
| You need to edit a file outside "Files allowed" | Stop. Say which file and why. |
| You need to change `packages/shared`, or change or drop an existing table or column | Stop. That's a contract change. John plans it; the product owner approves it. |
| The task is unclear or conflicts with `project.md` | Stop. Ask. Don't guess. |
| A needed task isn't merged and there's no mock | Stop. Say what you're waiting for. |

## After review

- Fix every valid CodeRabbit or John comment in the same branch.
- If a comment is wrong, reply on the PR with the reason. Don't silently ignore it.
- Never merge your own PR, never push to `main`, never force-push a branch under review.
- After any merge to `main`, pull before you start the next task.

## Database rules

- The app reaches the database only through `supabase-js`: `createOwnerClient()` (the owner's Clerk token, RLS applies) and `createServiceClient()` (secret key, server only), both in `apps/web/lib/supabase`.
- Migrations are SQL files in `supabase/migrations`, named `<UTC timestamp>_<name>.sql`, newer than the latest one on `main`. Never edit a merged migration.
- Every new table or function ships with its RLS policies and grants in the same migration (see `project.md` §7 and §9). Add a new table or column only if your task says so.
- Test migrations, policies and functions on pglite (`packages/db/supabase-pglite.ts`). Never run a local Supabase stack or a Docker database.
- The Supabase dev project is shared by everyone and every preview. Its data is throwaway, but never apply an unmerged migration to it. After your PR merges, apply it to dev through the Supabase MCP, recording the file's version, then regenerate the types (`pnpm db:types`, or the MCP's type generator) and confirm there's no diff.
- The Supabase MCP is scoped to the dev project. Never touch the production database; the product owner applies migrations to production before promoting the build.
- Migrations are additive: the version already live must keep working while one runs. Dropping or renaming a table or column happens in a later PR, once no deployed code uses it.

## Security rules

`docs/project.md` §9 lists every rule. The ones you must never break:

- Read the plan on the server in every gated action. Never trust the client.
- Owner reads go through the owner client, so RLS scopes them. Never use the service client with a manual owner filter; use it only after the route has checked ownership.
- Render visitor messages and bot replies as text, never HTML.
- No secret in `NEXT_PUBLIC_*`, the widget bundle, or a commit. Never remove `.env` or `ROLE.md` from `.gitignore`.

## Code conventions

| Area | Rule |
|---|---|
| Types | TypeScript `strict`. No `any`. Import API types from `packages/shared`; never redefine them. |
| API input | A zod schema per route, next to its type in `packages/shared` |
| API errors | `{ error: { code, message } }` with the right HTTP status |
| Tests | Vitest. At least one test per route and per pure function. |
| New dependency | Allowed. Name it and the reason in the PR body. |
| UI | Reuse components in `apps/web/components` |
| App name | `APP_NAME` from `packages/shared`. Never hardcode it. |

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | Run the app locally |
| `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` | Checks. All must pass before a PR. |
| `pnpm db:types` | Regenerate `packages/db/types.ts` from the dev project (needs `SUPABASE_ACCESS_TOKEN`; agents use the MCP's type generator instead) |
