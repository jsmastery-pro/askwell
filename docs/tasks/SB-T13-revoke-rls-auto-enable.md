# SB-T13 — Revoke EXECUTE on `rls_auto_enable()` (audit S1)

| Field | Value |
|---|---|
| Owner | Bob |
| Track | Supabase-native |
| Needs first | SB-T09 audit (`docs/security-review.md`, S1) |
| Files allowed | `supabase/migrations/**` (one new migration), `packages/db/supabase-*.test.ts`, `packages/db/supabase-pglite.ts` (stub additions only) |

## Why
Supabase's own `public.rls_auto_enable()` is SECURITY DEFINER and executable by `PUBLIC`, `anon` and `authenticated`. Calling it through the Data API fails today (400 `0A000`), but nothing should be able to call it. Lints 0028/0029.

## Steps
1. One migration: if `public.rls_auto_enable()` exists, revoke EXECUTE on it from `PUBLIC`, `anon` and `authenticated`. Do nothing if it doesn't exist (prod may not have it). Don't drop it, don't change its owner, body or search_path: the event trigger still needs it.
2. pglite test: with a stub `rls_auto_enable()` granted to everyone, the migration leaves `anon` and `authenticated` without EXECUTE; without the function, the migration still runs.
3. After merge: apply it to dev through the MCP (record the file's version), then re-run the security advisor.

## Done when
- [ ] The test passes; all checks pass
- [ ] After merge, dev's advisor no longer shows 0028 or 0029 for `rls_auto_enable`
