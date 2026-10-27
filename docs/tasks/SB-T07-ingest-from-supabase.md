# SB-T07 — Knowledge processing on Supabase

| Field | Value |
|---|---|
| Owner | Alice |
| Track | Supabase-native |
| Needs first | SB-T05, SB-T06 |
| Files allowed | `apps/web/lib/knowledge/**`, `apps/web/scripts/seed-knowledge.ts`, co-located tests |
| project.md | §6.4 |

## Steps
1. Processing (after finalize, or after a text paste) downloads the file from Supabase Storage, extracts and chunks it as today, embeds it, and inserts the chunks through the service client. It sets status `ready`, or `failed` on any error.
2. Delete removes the source row (chunks cascade) and the object. `deleteKnowledgeSource` stays row-only; each caller removes the object after the row (the delete route, finalize's refusal, the upload reclaim).
3. The seed script uses the service client.
4. A 10 MB PDF must finish within the route's `maxDuration` (300 s).

## Done when
- [ ] On a preview: a 9 MB PDF and pasted text both reach `ready`, and a question about them is answered from them
- [ ] A corrupt PDF ends `failed`
- [ ] Checks pass

## Notes
- CodeRabbit is required (chat/RAG).
- **Split with SB-T04 (decided 2026-10-27, John):** owner reads stay on the owner client (RLS). `listProjectKnowledgeSources` and `countProjectKnowledgeSources` are left as they are: SB-T04 stops calling them, and SB-T08 deletes them. **Update (John, after #95/#96):** nothing outside `lib/knowledge` uses them, `getKnowledgeSourceById` or `lib/knowledge`'s `toKnowledgeSource` any more, so SB-T07 deletes them and every Drizzle import in `lib/knowledge`. `getKnowledgeSourceById`, `processKnowledgeSource` and `deleteKnowledgeSource` move to the service client with the same signatures; callers check ownership first. The pasted-text route reserves through `rpc("reserve_knowledge_source")` (done in SB-T06).
