# SB-T03 — Postgres functions for atomic operations (`rpc()`) and generated types

| Field | Value |
|---|---|
| Owner | Bob |
| Track | Supabase-native |
| Needs first | SB-T02 |
| Files allowed | `supabase/migrations/**` (new migration), tests under `packages/db/**` (reusing `supabase-pglite.ts`), `packages/db/types.ts` (generated, new), `package.json` (`db:types` script only) |
| project.md | §5 Plans, §6.3, §6.4, §6.6, §9 |

## Goal
Every operation that today relies on a transaction or row lock in TypeScript becomes one Postgres function, called with `supabase.rpc()`.

## Functions
| Function | Replaces | Rules |
|---|---|---|
| `create_project(owner_id, name, public_key, project_limit)` | `lib/projects` count + insert under lock | Counts the owner's projects under a lock, inserts the project and its default widget config, and refuses when at the limit |
| `reserve_knowledge_source(project_id, title, type, storage_key, source_limit)` | knowledge route's locked count + insert | Files and pasted text count together (M2) |
| `consume_message(project_id, message_limit)` | quota reset + conditional `+1` in `lib/chat` | Resets the period when it's a month old; increments only while under the limit; returns whether it counted |
| `save_chat_turn(project_id, conversation_id, visitor_id, question, reply, asked_at, replied_at)` | `lib/chat` save transaction | Creates the conversation when needed, saves both messages, and returns the conversation ID plus `first_chat` (decided under the project lock, as in #77) |
| `match_chunks(project_id, query_embedding, match_count)` | `packages/db/queries/chunks.ts` | Cosine distance through the HNSW index; always one project only |

- **Limits come in as parameters** from our server, which reads the plan from `PLAN_LIMITS` in `packages/shared`. That keeps one source of truth.
- So **`EXECUTE` is granted only to `service_role`**, and revoked from `public`, `anon` and `authenticated`. Owners can't call these with their own token and pass a bigger limit.
- `security definer` only where needed, always with `set search_path = ''` and fully qualified names.

## Done when
- [ ] Each function has tests on pglite (SB-T02's helper), including at-limit refusals and a concurrency test for `consume_message` and `first_chat` once-only
- [ ] A test proves `anon` and `authenticated` can't execute them
- [ ] `packages/db/types.ts` generated from the **dev project** (`supabase gen types typescript --project-id pasgozggqtprenfgtghb`, or the MCP), plus a `pnpm db:types` script. Never `--local`.
- [ ] Checks pass

## Notes
- CodeRabbit is required.
- No local Supabase stack (decided 2026-10-27). Types need SB-T02's migration on dev. If it isn't there yet, open the PR with the functions and tests, and add the types once dev has the schema.
- Concurrency on pglite: it runs one connection, so test the locking logic (at-limit refusal, `first_chat` once only) with sequential calls. The real concurrency check runs on dev after merge.
