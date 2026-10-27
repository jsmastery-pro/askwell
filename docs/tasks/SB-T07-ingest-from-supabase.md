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
2. Delete removes the source row (chunks cascade) and the object.
3. The seed script uses the service client.
4. A 10 MB PDF must finish within the route's `maxDuration` (300 s).

## Done when
- [ ] On a preview: a 9 MB PDF and pasted text both reach `ready`, and a question about them is answered from them
- [ ] A corrupt PDF ends `failed`
- [ ] Checks pass

## Notes
- CodeRabbit is required (chat/RAG).
