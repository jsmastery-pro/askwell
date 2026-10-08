# P3-T01 — AI + shared foundations

| Field | Value |
|---|---|
| Owner | Bob |
| Lane | A |
| Needs first | P2-T03 |
| Files allowed | `packages/shared/**`, `apps/web/lib/ai/**`, `apps/web/package.json`, `pnpm-lock.yaml` |
| project.md | §3 Stack (AI), §6.4 Knowledge, §6.6 Chat, §9 Security rules (Secrets, Prompt injection) |

## Goal
The constants and OpenAI helpers both Phase 3 lanes import: model names, chunk settings, the chat rate limit, the "I don't know" reply, and embed functions.

## Steps
1. `packages/shared`: add `RATE_LIMITS.widgetChat = { windowSeconds: 60, max: 20 }` (§6.6). Don't change `widgetConfig`.
2. `packages/shared`: `AI_MODELS = { chat: "<model>", embedding: "text-embedding-3-small" }`, `EMBEDDING_DIMENSIONS = 1536`, `CHUNKING = { maxTokens: 800, overlapTokens: 100 }`, `RETRIEVAL_TOP_K = 5`, `DONT_KNOW_REPLY` (the exact "I don't know" sentence the bot uses).
3. `apps/web/lib/ai`: one server-only OpenAI client from `OPENAI_API_KEY`. `embedTexts(texts: string[]): Promise<number[][]>` (batched) and `embedQuery(text: string): Promise<number[]>`. Both assert 1536 dimensions.
4. Add `openai` to `apps/web`. Mark `lib/ai` server-only so it can never land in a client bundle.
5. Tests: constants match §6.6; `embedTexts` batches and returns vectors in input order (OpenAI client mocked); a wrong dimension throws.

## Done when
- [ ] `RATE_LIMITS.widgetChat` is 20 per 60 s; `widgetConfig` unchanged
- [ ] `embedTexts` / `embedQuery` tests pass with OpenAI mocked
- [ ] Importing `lib/ai` from a client component fails the build
- [ ] `OPENAI_API_KEY` appears in no `NEXT_PUBLIC_*` name and no client file
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- Do this first. P3-T02, P3-T04 and P3-T05 all import it. Keep the PR small.
- Chat model: put your proposal in `AI_MODELS.chat` and name it in the PR body. The product owner confirms it in review.
- This task owns `packages/shared` for Phase 3. Later Phase 3 shared changes: stop and ask.
- PostHog AI tracing (§6.6 step 6) is deferred to Phase 4 (product owner, 2026-10-08). Don't add PostHog here.
