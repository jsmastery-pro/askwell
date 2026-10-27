# SB-T11 — Postgres functions: chat quota, chat save, chunk search (`rpc()`)

| Field | Value |
|---|---|
| Owner | Alice |
| Track | Supabase-native |
| Needs first | SB-T02 (#92) |
| Files allowed | `supabase/migrations/**` (one new migration), `packages/db/supabase-functions-chat.test.ts` (new), `packages/db/supabase-pglite.ts` (additions only; coordinate with Bob's SB-T03 through the product owner if you both need one) |
| project.md | §5 Plans, §6.6, §9 |

## Goal
The chat route's atomic steps become Postgres functions, called with `supabase.rpc()` by our server. Bob does the owner-side functions (SB-T03) in parallel. Follow the same rules: read "Rules for every function" in `docs/tasks/SB-T03-postgres-functions.md`.

## Functions
| Function | Replaces | Rules |
|---|---|---|
| `consume_message(project_id, message_limit)` | quota reset + conditional `+1` in `lib/chat` | Locks the project row; resets the period when it's a month old; increments only while under the limit; returns whether it counted |
| `save_chat_turn(project_id, conversation_id, visitor_id, question, reply, asked_at, replied_at)` | `lib/chat` save transaction | Creates the conversation when needed (another project's `conversation_id` is refused, as today's 404), saves both messages, and returns the conversation ID plus `first_chat`, decided under the project lock (as in #77) |
| `match_chunks(project_id, query_embedding, match_count)` | `packages/db/queries/chunks.ts` | Cosine distance through the HNSW index; one project only; only chunks of `ready` sources (L8) |

## Done when
- [ ] Tests on pglite (SB-T02's helper), under both default-privilege modes: quota under, at and over the limit; period reset; `first_chat` true once only; foreign `conversation_id` refused; `match_chunks` never returns another project's chunks
- [ ] A test proves `anon` and `authenticated` can't execute these functions, and `service_role` can
- [ ] The PR lists each function: signature, security mode, grants, what it returns or raises
- [ ] Checks pass

## Notes
- CodeRabbit is required.
- No local Supabase stack. Read today's logic first: `apps/web/lib/chat/**`, `packages/db/queries/chunks.ts`. Behavior must match.
- `vector` lives in the `extensions` schema: write `extensions.vector(1536)` and `OPERATOR(extensions.<=>)` (needed with an empty `search_path`).
- Branch from `main` after #92 merges.
