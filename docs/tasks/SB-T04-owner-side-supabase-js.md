# SB-T04 — Owner side on `supabase-js` + RLS

| Field | Value |
|---|---|
| Owner | Bob |
| Track | Supabase-native |
| Needs first | SB-T03 and SB-T11, merged and applied to dev |
| Files allowed | `apps/web/lib/supabase/**` (new: client helpers), `apps/web/lib/data/**`, `apps/web/lib/projects/**`, `apps/web/lib/conversations/**`, `apps/web/app/dashboard/**` (data calls only), `apps/web/app/api/projects/**` (except `[id]/knowledge`), `apps/web/app/api/conversations/**`, `apps/web/app/api/knowledge/**`, `apps/web/package.json`, `pnpm-lock.yaml`, `packages/db/types.ts` (generated, new), `package.json` (`db:types` script only), co-located tests |
| project.md | §6.3, §6.7, §6.8, §6.12, §9 |

## Steps
0. **Types:** `packages/db/types.ts` generated from the **dev project** (`supabase gen types typescript --project-id pasgozggqtprenfgtghb`, or the MCP), plus a `pnpm db:types` script. Never `--local`. The clients below are typed with it.
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
5. Tests: mock `supabase-js` for unit tests. Policy behavior is already covered on pglite (SB-T02); no local Supabase stack.

## Done when
- [ ] The dashboard works end to end against dev Supabase (on the PR's Vercel preview)
- [ ] Owner A can't see owner B's data through any page or route
- [ ] No owner path imports Drizzle
- [ ] Checks pass

## Notes
- CodeRabbit is required.
- **Deleting a project** must also delete its files in Storage. RLS deletes the row and cascades the child rows, but not Storage objects. List the project's `storage_key`s first, delete the row with the owner client, then remove the objects with the service client.
- Our owner client runs on the server, but the Data API is public: any signed-in user can call it with the publishable key and their own Clerk token. RLS and the grants in SB-T02 are the real boundary, so never add a policy or grant just to make a route work. Ask John first.
