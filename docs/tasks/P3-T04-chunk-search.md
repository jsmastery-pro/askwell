# P3-T04 — Chunk search + seed script

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | B |
| Needs first | P3-T01 |
| Files allowed | `packages/db/queries/**`, `apps/web/scripts/**`, `apps/web/package.json`, `pnpm-lock.yaml` |
| project.md | §6.6 Chat (Retrieve), §7 Data model, §9 Security rules (Tenant leak) |

## Goal
A project-scoped vector search for chat, and a seed script so the chat route can be tested before Lane A's uploads exist.

## Steps
1. `packages/db/queries/chunks.ts`: `searchChunks(projectId, embedding, k = RETRIEVAL_TOP_K)` → top `k` chunks by cosine distance, `WHERE project_id = $projectId` always. Return content and distance.
2. Export it from `packages/db/queries/index.ts`.
3. `apps/web/scripts/seed-knowledge.ts`: given a project's public key and a text file, create a `knowledge_sources` row (type `text`, status `ready`) and embedded chunks via `embedTexts`. Document the command in the PR.
4. Tests (PGlite + pgvector, as in P1-T02): nearest chunk ranks first; chunks from another project never come back, even when they're closer; `k` is respected.

## Done when
- [ ] `searchChunks` never returns another project's chunks (test proves it with a closer foreign chunk)
- [ ] Results are ordered by similarity and capped at `k`
- [ ] The seed script fills a project with real chunks on your InstaCloud DB
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Use the HNSW index's operator (`<=>`, cosine), to match `vector_cosine_ops` from P1-T01.
- Only this task edits `packages/db` in Phase 3.
- The seed script is a dev tool: never run it against `main`.
