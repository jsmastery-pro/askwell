# SB-T04 — Owner side on `supabase-js` + RLS

| Field | Value |
|---|---|
| Owner | Bob |
| Track | Supabase-native |
| Needs first | SB-T03 |
| Files allowed | `apps/web/lib/supabase/**` (new: client helpers), `apps/web/lib/data/**`, `apps/web/lib/projects/**`, `apps/web/lib/conversations/**`, `apps/web/app/dashboard/**` (data calls only), `apps/web/app/api/projects/**` (except `[id]/knowledge`), `apps/web/app/api/conversations/**`, `apps/web/app/api/knowledge/**`, `apps/web/package.json`, `pnpm-lock.yaml`, co-located tests |
| project.md | §6.3, §6.7, §6.8, §6.12, §9 |

## Steps
1. **`lib/supabase`:**
   - `createOwnerClient()`: server-side, sends the signed-in Clerk session token (`accessToken: async () => (await auth()).getToken()`), so RLS applies.
   - `createServiceClient()`: server-only, uses `SUPABASE_SECRET_KEY`. `import "server-only"`. Never imported by client code.
2. **Owner reads** (dashboard pages, `lib/data/*`, conversations, usage, analytics, config read) use the owner client. RLS replaces the manual ownership filter.
   - Keep a 404 for "not found or not yours" (an empty RLS result → `notFound()`). Malformed IDs still give 404.
3. **Owner writes with a gate** (create project, rename/delete, config save with 402, knowledge delete):
   - the server checks the plan from `PLAN_LIMITS`
   - creating a project calls `rpc("create_project")` through the service client
   - rename and delete go through the owner client, with RLS checking ownership
4. **`ensureAccount`** (first sign-in) inserts the `accounts` row through the service client.
5. Tests: mock `supabase-js` for unit tests, and run the key owner flows against local Supabase.

## Done when
- [ ] The dashboard works end to end against dev Supabase (on the PR's Vercel preview)
- [ ] Owner A can't see owner B's data through any page or route
- [ ] No owner path imports Drizzle
- [ ] Checks pass

## Notes
- CodeRabbit is required.
