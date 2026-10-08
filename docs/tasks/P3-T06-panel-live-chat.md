# P3-T06 — Connect the panel to chat

| Field | Value |
|---|---|
| Owner | Alice |
| Lane | B |
| Needs first | P3-T05, P2-T06 |
| Files allowed | `apps/web/app/embed/**`, `apps/web/components/widget-panel/**` |
| project.md | §6.5 Widget (Panel), §6.6 Chat, §9 Security rules (XSS) |

## Goal
The `/embed` panel sends real messages to `POST /api/widget/chat` instead of the Phase 2 mock.

## Steps
1. Replace `getReply` with a call to `/api/widget/chat` (key, visitor ID, conversation ID, message).
2. Keep the returned `conversationId` in the iframe's `localStorage` next to the visitor ID (try/catch, in-memory fallback) and send it on later messages.
3. Error states, by `error.code`: `rate_limited` → "You're sending messages too fast, try again in a minute"; `quota_exceeded` → "This assistant is unavailable right now"; network/other → a retry option. Never show raw error text.
4. Enforce the 1,000-character limit in the input (server still checks).
5. Replies still render as text only.
6. Tests: success path shows the reply; `429` shows the friendly message; `conversationId` is reused on the second message.

## Done when
- [ ] On the Phase 2 cross-origin test page: upload a PDF → ask about it → correct answer
- [ ] An unrelated question → the "I don't know" reply
- [ ] Rapid-fire past 20 messages shows the rate-limit message
- [ ] Reloading continues the same conversation
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Notes
- This is the Phase 3 "Done when". Put a short clip in the PR.
- The end-to-end check needs P3-T02 merged for real uploads. Until then, use seeded chunks.
