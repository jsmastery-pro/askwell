# SB-T10 — Spike: local Supabase and the Supabase MCP in our sandboxes

| Field | Value |
|---|---|
| Owner | Alice |
| Track | Supabase-native |
| Needs first | — (the MCP part needs SB-T01 step 5) |
| Files allowed | None: report only, as a PR comment-free HQ message to John |

## Why
The Supabase-native plan assumes two things that our sandboxes may not allow:
- `supabase start`, a local Supabase in Docker, so we can test RLS policies and SQL functions for real
- the Supabase MCP server, which reaches the dev project over HTTPS for SQL and migrations

The sandbox network only allows HTTP(S) through a proxy, and raw Postgres was dropped (see MV-T03). Prove or disprove both before the team builds on them.

## Steps
1. Install the Supabase CLI. Run `supabase init` in a scratch folder **outside the repo**, then `supabase start`. Does the local stack come up, with Postgres, the Data API and Storage? Can you query the local Postgres, and call the local REST API with a test JWT?
2. If image pulls are blocked, call `request_access` for the registry host the error names, and say which.
3. Once the product owner has configured the MCP (SB-T01 step 5): list tables and run a read-only `select 1` against dev through it. Don't change anything in dev.
4. Report: what works, what doesn't, the exact errors, and any access you had to request.

## Done when
- [ ] A clear yes or no for local Supabase, with evidence
- [ ] A clear yes or no for the MCP against dev, or "waiting on SB-T01"
