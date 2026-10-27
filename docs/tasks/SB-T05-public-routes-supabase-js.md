# SB-T05 — Widget, chat and billing webhook on `supabase-js` + `rpc()`

| Field | Value |
|---|---|
| Owner | Alice |
| Track | Supabase-native |
| Needs first | SB-T11, and SB-T04 merged (its `lib/supabase` helpers and generated types) |
| Files allowed | `apps/web/lib/widget-config/**`, `apps/web/lib/chat/**`, `apps/web/app/api/widget/**`, `apps/web/app/api/clerk/webhook/**`, `apps/web/app/embed/page.tsx` (config lookup only), co-located tests |
| project.md | §6.5, §6.6, §6.10, §9 |

## Steps
1. **Widget config:** look the project up by `public_key` through the **service client** (visitors have no token), and return the plan-applied config as today.
2. **Chat:**
   - same order as today: rate limit, then key, then quota
   - check a given `conversationId` belongs to the project (service client select) **before** the quota, as today, so a foreign ID gets 404 without using quota or a model call
   - the quota uses `rpc("consume_message")` **before** the embedding and model call. It counts the message right away: `false` means quota exceeded, with no OpenAI call. This replaces today's early check + count-at-save, and the race note in `docs/security-review.md` goes away. Correction (John): today a model error or timeout returns 500 and counts nothing. Now it still counts, because the message was counted before the call. Accepted: it's rare (15 s timeout), and it closes the race. No refund step.
   - retrieval uses `rpc("match_chunks")`
   - saving uses `rpc("save_chat_turn")`; map its codes: `AWNOC` → 404, `AWNOP` → 404
   - prompts, the leak guard, timeouts, the PostHog trace and `first_chat` stay as they are; `first_chat` now comes from the function's result
3. **Clerk webhook:** `setPlan` through the service client. Keep the signature check, plan slug check, Clerk confirmation (L5) and idempotency.
4. Visitors never get a Supabase key; everything stays in our server routes.

## Done when
- [ ] On the PR's Vercel preview:
  - the widget loads
  - chat answers from knowledge, and an unrelated question gets the exact "I don't know"
  - the quota counts
  - the 21st message in a minute gets 429
  - an upgrade unlocks Customize
- [ ] Checks pass

## Notes
- CodeRabbit is required (chat, billing).
