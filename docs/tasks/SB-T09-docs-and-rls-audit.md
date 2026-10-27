# SB-T09 — Spec rewrite and RLS / function-grant security audit

| Field | Value |
|---|---|
| Owner | John |
| Track | Supabase-native |
| Needs first | Docs alongside the track; audit after SB-T08 |
| Files allowed | `docs/**`, `CLAUDE.md` |

## Steps
1. `project.md`:
   - §3: the Supabase-native stack
   - §7: RLS replaces app-level isolation for owner reads
   - §9: RLS, function grants, and the server-only secret key
   - §11: the new env
   - §6.4: back to 10 MB
2. `CLAUDE.md` database rules: Supabase CLI migrations; agents apply to dev only, through the MCP after merge; the product owner applies to prod.
3. Launch checklist (P6-T05) and setup checklists updated.
4. **Audit:** every policy and every function grant, against §9. Owner isolation, `anon` access, the `security definer` `search_path`, the secret key never reaching the client, and storage access through signed URLs only. Findings go into `docs/security-review.md`, then become fix tasks.

## Done when
- [ ] Docs match the code
- [ ] The audit report is written, with no open high or medium findings before launch

## Notes
- **From SB-T04 (Bob, 2026-10-27):** the dev security advisor flags `rls_auto_enable()`, Supabase's own SECURITY DEFINER event-trigger function, as executable by `anon` and `authenticated` through `/rest/v1/rpc`. It's not ours. An event-trigger function can't be called directly, so the risk looks low, but the audit confirms that on dev and on prod. If it's reachable, a migration revokes EXECUTE from `PUBLIC`, `anon` and `authenticated`.
- `pnpm db:types` uses the Supabase CLI, which needs `SUPABASE_ACCESS_TOKEN` or `supabase login`. Agents don't have either and generate types through the MCP (same generator). The `CLAUDE.md` rewrite says so.
