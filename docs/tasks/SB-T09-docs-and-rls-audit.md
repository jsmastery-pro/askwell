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
